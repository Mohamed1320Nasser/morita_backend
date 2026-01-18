import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateOrderDto,
    DiscordCreateOrderDto,
    OrderStatus,
    UpdateOrderStatusDto,
    AssignWorkerDto,
    GetOrderListDto,
    CompleteOrderDto,
    ConfirmOrderDto,
    CancelOrderDto,
    ClaimOrderDto,
} from "./dtos";
import { WalletTransactionType } from "../wallet/dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { Decimal } from "@prisma/client/runtime/library";
import logger from "../../common/loggers";
import WalletService from "../wallet/wallet.service";
import { withTransactionRetry, checkWalletBalanceWithLock, updateWalletBalance, deductFromWorkerWallet } from "../../common/utils/transaction.util";
import { PAYOUT_STRUCTURE, FINANCIAL_LIMITS, isValidAmount } from "../../common/constants/security.constants";
import { InsufficientBalanceError } from "../../common/utils/errorHandler.util";
import { OrderStatus as PrismaOrderStatus } from "@prisma/client";

@Service()
export default class OrderService {
    constructor(private walletService: WalletService) {}

    /**
     * Create Order
     *
     * BUSINESS FLOW:
     * 1. Customer locks ORDER VALUE (payment) in pending
     * 2. Worker locks DEPOSIT (security) when claiming/assigned
     * 3. On completion: Customer's order value distributed, Worker's deposit returned
     */
    async createOrder(data: CreateOrderDto) {
        logger.info(`[OrderService] Creating order for customer ${data.customerId}`);

        if (!isValidAmount(data.orderValue, FINANCIAL_LIMITS.MIN_ORDER_VALUE, FINANCIAL_LIMITS.MAX_ORDER_VALUE)) {
            throw new BadRequestError(
                `Order value must be between $${FINANCIAL_LIMITS.MIN_ORDER_VALUE} and $${FINANCIAL_LIMITS.MAX_ORDER_VALUE}`
            );
        }

        if (!isValidAmount(data.depositAmount, FINANCIAL_LIMITS.MIN_DEPOSIT, FINANCIAL_LIMITS.MAX_DEPOSIT)) {
            throw new BadRequestError(
                `Deposit amount must be between $${FINANCIAL_LIMITS.MIN_DEPOSIT} and $${FINANCIAL_LIMITS.MAX_DEPOSIT}`
            );
        }

        const orderValue = new Decimal(data.orderValue);
        const workerPayout = orderValue.mul(PAYOUT_STRUCTURE.WORKER_PERCENTAGE);
        const supportPayout = orderValue.mul(PAYOUT_STRUCTURE.SUPPORT_PERCENTAGE);
        const systemPayout = orderValue.mul(PAYOUT_STRUCTURE.SYSTEM_PERCENTAGE);
        const requiredDeposit = new Decimal(data.depositAmount);

        const customer = await prisma.user.findUnique({
            where: { id: data.customerId },
        });

        if (!customer) {
            throw new NotFoundError("Customer not found");
        }

        if (data.serviceId) {
            const service = await prisma.service.findUnique({
                where: { id: data.serviceId },
            });

            if (!service) {
                throw new NotFoundError("Service not found");
            }
        }

        const customerWallet = await this.walletService.getWalletByUserId(data.customerId);
        if (!customerWallet) {
            throw new BadRequestError("Customer does not have a wallet");
        }

        if (data.workerId) {
            const worker = await prisma.user.findUnique({
                where: { id: data.workerId },
            });

            if (!worker) {
                throw new NotFoundError("Worker not found");
            }

            const workerWallet = await this.walletService.getWalletByUserId(data.workerId);
            if (!workerWallet) {
                throw new BadRequestError("Worker does not have a wallet");
            }
        }

        const order = await withTransactionRetry(async (tx) => {
            const customerBalanceCheck = await checkWalletBalanceWithLock(
                tx,
                customerWallet.id,
                orderValue.toNumber(),
                'customer'
            );

            if (!customerBalanceCheck.sufficient) {
                throw new InsufficientBalanceError(
                    orderValue.toNumber(),
                    customerBalanceCheck.available,
                    'customer'
                );
            }

            await updateWalletBalance(
                tx,
                customerWallet.id,
                -orderValue.toNumber(),
                orderValue.toNumber()
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: customerWallet.id,
                    type: "PAYMENT",
                    amount: orderValue.neg(),
                    balanceBefore: customerBalanceCheck.wallet.balance,
                    balanceAfter: new Decimal(customerBalanceCheck.wallet.balance).sub(orderValue).toNumber(),
                    currency: customerWallet.currency,
                    status: "PENDING",
                    notes: `Order payment locked (escrow)`,
                    createdById: data.customerId,
                },
            });

            if (data.workerId) {
                const workerWallet = await tx.wallet.findUnique({
                    where: { userId: data.workerId },
                });

                if (workerWallet) {
                    const workerBalanceCheck = await checkWalletBalanceWithLock(
                        tx,
                        workerWallet.id,
                        requiredDeposit.toNumber(),
                        'worker'
                    );

                    if (!workerBalanceCheck.sufficient) {
                        const workerDeposit = typeof workerWallet.deposit === 'object'
                            ? parseFloat(workerWallet.deposit.toString())
                            : workerWallet.deposit;
                        const workerBalance = typeof workerWallet.balance === 'object'
                            ? parseFloat(workerWallet.balance.toString())
                            : workerWallet.balance;
                        const workerPendingBalance = typeof workerWallet.pendingBalance === 'object'
                            ? parseFloat(workerWallet.pendingBalance.toString())
                            : workerWallet.pendingBalance;

                        throw new InsufficientBalanceError(
                            requiredDeposit.toNumber(),
                            workerBalanceCheck.available,
                            'worker',
                            {
                                deposit: workerDeposit,
                                balance: workerBalance - workerPendingBalance
                            }
                        );
                    }

                    const deduction = await deductFromWorkerWallet(
                        tx,
                        workerWallet.id,
                        requiredDeposit.toNumber(),
                        requiredDeposit.toNumber()
                    );

                    const balanceBefore = workerBalanceCheck.wallet.balance;
                    const balanceAfter = balanceBefore - deduction.fromBalance;

                    await tx.walletTransaction.create({
                        data: {
                            walletId: workerWallet.id,
                            type: "PAYMENT",
                            amount: requiredDeposit.neg(),
                            balanceBefore,
                            balanceAfter,
                            currency: workerWallet.currency,
                            status: "PENDING",
                            notes: deduction.fromDeposit > 0
                                ? `Worker security deposit (${deduction.fromBalance.toFixed(2)} from balance, ${deduction.fromDeposit.toFixed(2)} from deposit)`
                                : `Worker security deposit`,
                            createdById: data.workerId!,
                        },
                    });
                }
            }

            const lastOrder = await tx.order.findFirst({
                orderBy: { orderNumber: "desc" },
                select: { orderNumber: true },
            });
            const nextOrderNumber = (lastOrder?.orderNumber || 0) + 1;

            const createdOrder = await tx.order.create({
                data: {
                    orderNumber: nextOrderNumber,
                    customerId: data.customerId,
                    workerId: data.workerId,
                    supportId: data.supportId,
                    ticketId: data.ticketId,
                    serviceId: data.serviceId,
                    methodId: data.methodId,
                    paymentMethodId: data.paymentMethodId,
                    orderValue: data.orderValue,
                    depositAmount: data.depositAmount,
                    currency: data.currency || "USD",
                    workerPayout: workerPayout.toNumber(),
                    supportPayout: supportPayout.toNumber(),
                    systemPayout: systemPayout.toNumber(),
                    jobDetails: data.jobDetails,
                    status: data.workerId ? OrderStatus.ASSIGNED : OrderStatus.PENDING,
                    assignedAt: data.workerId ? new Date() : null,
                },
                include: {
                    customer: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    worker: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    support: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    service: true,
                    method: true,
                    paymentMethod: true,
                },
            });

            await tx.walletTransaction.updateMany({
                where: {
                    walletId: customerWallet.id,
                    orderId: null,
                    status: "PENDING",
                    createdAt: { gte: new Date(Date.now() - 5000) },
                },
                data: {
                    orderId: createdOrder.id,
                    reference: `Order #${createdOrder.orderNumber} - Payment locked`,
                },
            });

            if (data.workerId) {
                const workerWallet = await tx.wallet.findUnique({
                    where: { userId: data.workerId },
                });
                if (workerWallet) {
                    await tx.walletTransaction.updateMany({
                        where: {
                            walletId: workerWallet.id,
                            orderId: null,
                            status: "PENDING",
                            createdAt: { gte: new Date(Date.now() - 5000) },
                        },
                        data: {
                            orderId: createdOrder.id,
                            reference: `Order #${createdOrder.orderNumber} - Deposit locked`,
                        },
                    });
                }
            }

            await tx.orderStatusHistory.create({
                data: {
                    orderId: createdOrder.id,
                    fromStatus: null,
                    toStatus: createdOrder.status,
                    changedById: data.supportId || data.customerId,
                    reason: "Order created",
                },
            });

            if (data.ticketId) {
                await tx.ticket.update({
                    where: { id: data.ticketId },
                    data: { status: "IN_PROGRESS" },
                });
            }

            return createdOrder;
        });

        logger.info(`[OrderService] Order created: ${order.id} (#${order.orderNumber})`);
        logger.info(`[OrderService] Customer locked: $${orderValue.toNumber()} (order value)`);
        if (data.workerId) {
            logger.info(`[OrderService] Worker locked: $${requiredDeposit.toNumber()} (deposit)`);
        }

        return order;
    }

    /**
     * Create order via Discord (handles Discord ID lookups)
     */
    async createOrderByDiscord(data: DiscordCreateOrderDto) {
        logger.info(
            `[OrderService] Creating order via Discord for customer ${data.customerDiscordId}`
        );

        const customer = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId },
        });

        if (!customer) {
            throw new NotFoundError(
                `Customer with Discord ID ${data.customerDiscordId} not found`
            );
        }

        const support = await prisma.user.findUnique({
            where: { discordId: data.supportDiscordId },
        });

        if (!support) {
            throw new NotFoundError(
                `Support user with Discord ID ${data.supportDiscordId} not found`
            );
        }

        let worker = null;
        if (data.workerDiscordId) {
            worker = await prisma.user.findUnique({
                where: { discordId: data.workerDiscordId },
            });

            if (!worker) {
                throw new NotFoundError(
                    `Worker with Discord ID ${data.workerDiscordId} not found`
                );
            }
        }

        return this.createOrder({
            customerId: customer.id,
            workerId: worker?.id,
            supportId: support.id,
            ticketId: data.ticketId,
            serviceId: data.serviceId,
            methodId: data.methodId,
            paymentMethodId: data.paymentMethodId,
            orderValue: data.orderValue,
            depositAmount: data.depositAmount,
            currency: data.currency,
            jobDetails: data.jobDetails,
        });
    }

    /**
     * Get order by ID
     */
    async getOrderById(orderId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                worker: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                support: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                service: true,
                method: true,
                paymentMethod: true,
                ticket: true,
                statusHistory: {
                    include: {
                        changedBy: {
                            select: {
                                id: true,
                                fullname: true,
                                username: true,
                            },
                        },
                    },
                    orderBy: {
                        createdAt: "desc",
                    },
                },
            },
        });

        if (!order) {
            throw new NotFoundError("Order not found");
        }

        return order;
    }

    /**
     * Get debug info about orders (for troubleshooting)
     */
    async getOrderDebugInfo() {
        try {
            const totalOrders = await prisma.order.count();
            const ordersByStatus = await prisma.order.groupBy({
                by: ['status'],
                _count: true,
            });

            const recentOrders = await prisma.order.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    orderNumber: true,
                    status: true,
                    orderValue: true,
                    createdAt: true,
                    customer: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                        }
                    }
                }
            });

            logger.info(`[OrderService] Debug info - Total orders: ${totalOrders}`);
            logger.info(`[OrderService] Debug info - Orders by status:`, ordersByStatus);

            return {
                totalOrders,
                ordersByStatus: ordersByStatus.map(item => ({
                    status: item.status,
                    count: item._count
                })),
                recentOrders: recentOrders.map(order => ({
                    ...order,
                    orderValue: parseFloat(order.orderValue.toString())
                })),
                message: 'Debug info retrieved successfully',
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logger.error(`[OrderService] Error getting debug info:`, error);
            throw error;
        }
    }

    /**
     * Get order list with filters
     */
    async getOrders(query: GetOrderListDto) {
        const { search, status, customerId, workerId, ticketId, page, limit, sortBy, sortOrder } = query;
        const skip = (page! - 1) * limit!;

        logger.info(`[OrderService] getOrders called with params:`, {
            page,
            limit,
            search,
            status,
            customerId,
            workerId,
            ticketId,
            sortBy,
            sortOrder
        });

        const where: any = {};

        if (search) {
            const isNumber = /^\d+$/.test(search);

            if (isNumber) {
                where.orderNumber = parseInt(search);
                logger.info(`[OrderService] Searching by order number: ${search}`);
            } else {
                where.OR = [
                    { customer: { fullname: { contains: search } } },
                    { worker: { fullname: { contains: search } } },
                ];
                logger.info(`[OrderService] Searching by name: ${search}`);
            }
        }

        if (status) {
            where.status = status;
            logger.info(`[OrderService] Filtering by status: ${status}`);
        }

        if (customerId) {
            where.customerId = customerId;
            logger.info(`[OrderService] Filtering by customerId: ${customerId}`);
        }

        if (workerId) {
            where.workerId = workerId;
            logger.info(`[OrderService] Filtering by workerId: ${workerId}`);
        }

        if (ticketId) {
            where.ticketId = ticketId;
            logger.info(`[OrderService] Filtering by ticketId: ${ticketId}`);
        }

        logger.info(`[OrderService] Built where clause:`, JSON.stringify(where));
        logger.info(`[OrderService] Pagination: skip=${skip}, take=${limit}`);

        try {
            const [orders, total] = await Promise.all([
                prisma.order.findMany({
                    where,
                    include: {
                        customer: {
                            select: {
                                id: true,
                                fullname: true,
                                username: true,
                                discordId: true,
                            },
                        },
                        worker: {
                            select: {
                                id: true,
                                fullname: true,
                                username: true,
                                discordId: true,
                            },
                        },
                        service: true,
                        method: true,
                    },
                    skip,
                    take: limit,
                    orderBy: { [sortBy!]: sortOrder },
                }),
                prisma.order.count({ where }),
            ]);

            logger.info(`[OrderService] Found ${orders.length} orders out of ${total} total`);
            logger.info(`[OrderService] Response: page=${page}, limit=${limit}, totalPages=${Math.ceil(total / limit!)}`);

            return {
                list: orders,
                total,
                page: page!,
                limit: limit!,
                totalPages: Math.ceil(total / limit!),
            };
        } catch (error) {
            logger.error(`[OrderService] Error fetching orders:`, error);
            throw error;
        }
    }

    /**
     * Assign worker to order
     */
    async assignWorker(orderId: string, data: AssignWorkerDto) {
        const order = await this.getOrderById(orderId);

        if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CLAIMING) {
            throw new BadRequestError("Order cannot be assigned in current status");
        }

        const worker = await prisma.user.findUnique({
            where: { id: data.workerId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found");
        }

        const workerWallet = await this.walletService.getWalletByUserId(data.workerId);
        if (!workerWallet) {
            throw new BadRequestError("Worker does not have a wallet");
        }

        const balance = new Decimal(workerWallet.balance.toString());
        const deposit = new Decimal(workerWallet.deposit.toString());
        const eligibilityBalance = deposit.plus(balance);
        const requiredDeposit = new Decimal(order.depositAmount.toString());

        if (eligibilityBalance.lessThan(requiredDeposit)) {
            throw new BadRequestError(
                `Worker has insufficient eligibility. Required: $${requiredDeposit.toFixed(2)}, ` +
                `Available: $${eligibilityBalance.toFixed(2)} (Deposit: $${deposit.toFixed(2)}, Balance: $${balance.toFixed(2)})`
            );
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
                workerId: data.workerId,
                status: OrderStatus.ASSIGNED,
                assignedAt: new Date(),
            },
            include: {
                customer: true,
                worker: true,
                support: true,
                service: true,
            },
        });

        await prisma.orderStatusHistory.create({
            data: {
                orderId,
                fromStatus: order.status,
                toStatus: OrderStatus.ASSIGNED,
                changedById: data.assignedById,
                reason: data.notes || "Worker assigned",
            },
        });

        logger.info(`[OrderService] Worker ${data.workerId} assigned to order ${orderId}`);

        return updatedOrder;
    }

    /**
     * Worker claims an unassigned order
     */
    async claimOrder(orderId: string, data: ClaimOrderDto) {
        const order = await this.getOrderById(orderId);

        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestError("Order is not available for claiming");
        }

        if (order.workerId) {
            throw new BadRequestError("Order already has a worker assigned");
        }

        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found. Please ensure you have a registered account.");
        }

        const workerWallet = await this.walletService.getWalletByUserId(worker.id);
        if (!workerWallet) {
            throw new BadRequestError("You do not have a wallet. Please contact support.");
        }

        const requiredDeposit = new Decimal(order.depositAmount.toString());

        const updatedOrder = await withTransactionRetry(async (tx) => {
            const balanceCheck = await checkWalletBalanceWithLock(
                tx,
                workerWallet.id,
                requiredDeposit.toNumber(),
                'worker'
            );

            if (!balanceCheck.sufficient) {
                const workerDeposit = typeof balanceCheck.wallet.deposit === 'object'
                    ? parseFloat(balanceCheck.wallet.deposit.toString())
                    : balanceCheck.wallet.deposit;
                const workerBalance = typeof balanceCheck.wallet.balance === 'object'
                    ? parseFloat(balanceCheck.wallet.balance.toString())
                    : balanceCheck.wallet.balance;
                const workerPendingBalance = typeof balanceCheck.wallet.pendingBalance === 'object'
                    ? parseFloat(balanceCheck.wallet.pendingBalance.toString())
                    : balanceCheck.wallet.pendingBalance;

                throw new InsufficientBalanceError(
                    requiredDeposit.toNumber(),
                    balanceCheck.available,
                    'worker',
                    {
                        deposit: workerDeposit,
                        balance: workerBalance - workerPendingBalance
                    }
                );
            }

            const deduction = await deductFromWorkerWallet(
                tx,
                workerWallet.id,
                requiredDeposit.toNumber(),
                requiredDeposit.toNumber()
            );

            const balanceBefore = balanceCheck.wallet.balance;
            const balanceAfter = balanceBefore - deduction.fromBalance;

            await tx.walletTransaction.create({
                data: {
                    walletId: workerWallet.id,
                    orderId: order.id,
                    type: "PAYMENT",
                    amount: requiredDeposit.neg(),
                    balanceBefore,
                    balanceAfter,
                    currency: workerWallet.currency,
                    status: "PENDING",
                    reference: `Order #${order.orderNumber} - Worker deposit locked`,
                    notes: deduction.fromDeposit > 0
                        ? `Security deposit for claiming job (${deduction.fromBalance.toFixed(2)} from balance, ${deduction.fromDeposit.toFixed(2)} from deposit)`
                        : `Security deposit for claiming job`,
                    createdById: worker.id,
                },
            });

            const updated = await tx.order.update({
                where: { id: orderId },
                data: {
                    workerId: worker.id,
                    status: OrderStatus.ASSIGNED,
                    assignedAt: new Date(),
                },
                include: {
                    customer: true,
                    worker: true,
                    support: true,
                    service: true,
                },
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    fromStatus: order.status,
                    toStatus: OrderStatus.ASSIGNED,
                    changedById: worker.id,
                    reason: "Job claimed by worker",
                },
            });

            await tx.orderStatusHistory.create({
                data: {
                    orderId,
                    fromStatus: OrderStatus.ASSIGNED,
                    toStatus: OrderStatus.IN_PROGRESS,
                    changedById: worker.id,
                    reason: "Work started automatically after claiming",
                },
            });

            return updated;
        });

        logger.info(
            `[OrderService] Worker ${worker.id} claimed order ${orderId}, locked $${requiredDeposit.toNumber()} deposit`
        );

        return updatedOrder;
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, data: UpdateOrderStatusDto) {
        const order = await this.getOrderById(orderId);

        if (order.status !== data.status) {
            this.validateStatusTransition(order.status, data.status);
        }

        const updatedOrder = await prisma.order.update({
            where: { id: orderId },
            data: {
                status: data.status,
                ...(data.status === OrderStatus.IN_PROGRESS && { startedAt: new Date() }),
                ...(data.status === OrderStatus.AWAITING_CONFIRM && { completedAt: new Date() }),
                ...(data.status === OrderStatus.COMPLETED && { confirmedAt: new Date() }),
                ...(data.status === OrderStatus.CANCELLED && { cancelledAt: new Date() }),
                ...(data.notes && { completionNotes: data.notes }),
            },
        });

        await prisma.orderStatusHistory.create({
            data: {
                orderId,
                fromStatus: order.status,
                toStatus: data.status,
                changedById: data.changedById,
                reason: data.reason,
            },
        });

        if (order.ticketId) {
            type TicketStatus = "OPEN" | "IN_PROGRESS" | "AWAITING_CONFIRMATION" | "COMPLETED" | "CANCELLED" | "CLOSED";
            let ticketStatus: TicketStatus | undefined;
            if (data.status === OrderStatus.IN_PROGRESS) {
                ticketStatus = "IN_PROGRESS";
            } else if (data.status === OrderStatus.AWAITING_CONFIRM) {
                ticketStatus = "AWAITING_CONFIRMATION";
            } else if (data.status === OrderStatus.COMPLETED) {
                ticketStatus = "COMPLETED";
            } else if (data.status === OrderStatus.CANCELLED) {
                ticketStatus = "CANCELLED";
            }

            if (ticketStatus) {
                await prisma.ticket.update({
                    where: { id: order.ticketId },
                    data: { status: ticketStatus },
                });
            }
        }

        logger.info(`[OrderService] Order ${orderId} status updated: ${order.status} → ${data.status}`);

        return updatedOrder;
    }

    /**
     * Worker marks order as complete
     */
    async completeOrder(data: CompleteOrderDto) {
        const order = await this.getOrderById(data.orderId);

        if (order.workerId !== data.workerId) {
            throw new BadRequestError("Only assigned worker can mark order as complete");
        }

        if (order.status !== OrderStatus.IN_PROGRESS) {
            throw new BadRequestError("Order must be IN_PROGRESS to complete");
        }

        return this.updateOrderStatus(data.orderId, {
            status: OrderStatus.AWAITING_CONFIRM,
            changedById: data.workerId,
            reason: "Worker marked order as complete",
            notes: data.completionNotes,
        });
    }

    /**
     * Customer or support/admin confirms order completion (triggers payout)
     */
    async confirmOrderCompletion(data: ConfirmOrderDto) {
        const order = await this.getOrderById(data.orderId);

        // Get user to check their role
        const confirmingUser = await prisma.user.findUnique({
            where: { id: data.customerId },
        });

        if (!confirmingUser) {
            throw new NotFoundError("User not found");
        }

        // Allow customer, support, or admin to confirm
        const isCustomer = order.customerId === data.customerId;
        const isSupportOrAdmin = confirmingUser.discordRole === "support" || confirmingUser.discordRole === "admin";

        if (!isCustomer && !isSupportOrAdmin) {
            throw new BadRequestError("Only customer, support, or admin can confirm order completion");
        }

        if (order.status !== OrderStatus.AWAITING_CONFIRM) {
            throw new BadRequestError("Order must be AWAITING_CONFIRM to confirm");
        }

        const reason = isCustomer
            ? "Customer confirmed completion"
            : `${confirmingUser.discordRole} confirmed completion on behalf of customer`;

        await this.updateOrderStatus(data.orderId, {
            status: OrderStatus.COMPLETED,
            changedById: data.customerId,
            reason,
            notes: data.feedback,
        });

        await this.processOrderPayouts(data.orderId);

        return this.getOrderById(data.orderId);
    }

    /**
     * Validate status transition
     * Enforces proper order flow and prevents invalid status changes
     */
    private validateStatusTransition(currentStatus: PrismaOrderStatus, newStatus: OrderStatus): void {
        const validTransitions: Record<PrismaOrderStatus, PrismaOrderStatus[]> = {
            [PrismaOrderStatus.PENDING]: [PrismaOrderStatus.CLAIMING, PrismaOrderStatus.ASSIGNED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.CLAIMING]: [PrismaOrderStatus.ASSIGNED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.ASSIGNED]: [PrismaOrderStatus.IN_PROGRESS, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.IN_PROGRESS]: [PrismaOrderStatus.AWAITING_CONFIRM, PrismaOrderStatus.CANCELLED, PrismaOrderStatus.DISPUTED],
            [PrismaOrderStatus.AWAITING_CONFIRM]: [PrismaOrderStatus.COMPLETED, PrismaOrderStatus.DISPUTED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.COMPLETED]: [PrismaOrderStatus.DISPUTED],
            [PrismaOrderStatus.CANCELLED]: [PrismaOrderStatus.REFUNDED],
            [PrismaOrderStatus.DISPUTED]: [PrismaOrderStatus.COMPLETED, PrismaOrderStatus.REFUNDED, PrismaOrderStatus.CANCELLED, PrismaOrderStatus.IN_PROGRESS, PrismaOrderStatus.AWAITING_CONFIRM],
            [PrismaOrderStatus.REFUNDED]: [],
        };

        const allowedStatuses = validTransitions[currentStatus] || [];
        const newStatusAsPrisma = newStatus as unknown as PrismaOrderStatus;

        if (!allowedStatuses.includes(newStatusAsPrisma)) {
            throw new BadRequestError(
                `Invalid status transition: Cannot change from ${currentStatus} to ${newStatus}. ` +
                `Allowed transitions: ${allowedStatuses.join(', ') || 'None'}`
            );
        }
    }

    /**
     * Process order payouts (80% worker, 5% support, 15% system)
     */
    /**
     * Process Order Payouts (on completion)
     *
     * 1. Release customer's pending ORDER VALUE and distribute it
     * 2. Release worker's pending DEPOSIT back to worker
     * 3. Pay worker their earnings
     * 4. Pay support commission
     */
    private async processOrderPayouts(orderId: string) {
        const order = await this.getOrderById(orderId);

        if (order.payoutProcessed) {
            logger.warn(`[OrderService] Payouts already processed for order ${orderId}, skipping`);
            return;
        }

        if (!order.workerId || !order.supportId) {
            logger.error(`[OrderService] Cannot process payouts: missing worker or support for order ${orderId}`);
            throw new BadRequestError("Cannot process payouts: missing worker or support");
        }

        logger.info(`[OrderService] Processing payouts for order ${orderId}`);

        const customerWallet = await this.walletService.getWalletByUserId(order.customerId);
        const workerWallet = await this.walletService.getWalletByUserId(order.workerId);
        const supportWallet = await this.walletService.getWalletByUserId(order.supportId);

        if (!customerWallet || !workerWallet || !supportWallet) {
            throw new BadRequestError("Missing wallet for payout");
        }

        const orderValue = new Decimal(order.orderValue.toString());
        const depositAmount = new Decimal(order.depositAmount.toString());
        const workerPayout = new Decimal(order.workerPayout!.toString());
        const supportPayout = new Decimal(order.supportPayout!.toString());

        await withTransactionRetry(async (tx) => {
            await updateWalletBalance(
                tx,
                customerWallet.id,
                0,
                -orderValue.toNumber()
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: customerWallet.id,
                    orderId: order.id,
                    type: "RELEASE",
                    amount: -orderValue.toNumber(),
                    balanceBefore: customerWallet.balance,
                    balanceAfter: customerWallet.balance,
                    status: "COMPLETED",
                    reference: `Order #${order.orderNumber} - Payment released for distribution`,
                    createdById: order.customerId,
                },
            });

            await updateWalletBalance(
                tx,
                workerWallet.id,
                depositAmount.toNumber(),
                -depositAmount.toNumber()
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: workerWallet.id,
                    orderId: order.id,
                    type: "RELEASE",
                    amount: depositAmount,
                    balanceBefore: workerWallet.balance,
                    balanceAfter: new Decimal(workerWallet.balance).add(depositAmount).toNumber(),
                    status: "COMPLETED",
                    reference: `Order #${order.orderNumber} - Security deposit returned`,
                    notes: `Job completed successfully`,
                    createdById: order.workerId!,
                },
            });

            await updateWalletBalance(
                tx,
                workerWallet.id,
                workerPayout.toNumber(),
                0
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: workerWallet.id,
                    orderId: order.id,
                    type: "EARNING",
                    amount: workerPayout,
                    balanceBefore: new Decimal(workerWallet.balance).add(depositAmount).toNumber(),
                    balanceAfter: new Decimal(workerWallet.balance).add(depositAmount).add(workerPayout).toNumber(),
                    status: "COMPLETED",
                    reference: `Order #${order.orderNumber} - Payment (80%)`,
                    notes: `Worker earnings`,
                    createdById: order.customerId,
                },
            });

            await updateWalletBalance(
                tx,
                supportWallet.id,
                supportPayout.toNumber(),
                0
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: supportWallet.id,
                    orderId: order.id,
                    type: "COMMISSION",
                    amount: supportPayout,
                    balanceBefore: supportWallet.balance,
                    balanceAfter: new Decimal(supportWallet.balance).add(supportPayout).toNumber(),
                    status: "COMPLETED",
                    reference: `Order #${order.orderNumber} - Commission (5%)`,
                    notes: `Support commission`,
                    createdById: order.customerId,
                },
            });

            await tx.order.update({
                where: { id: orderId },
                data: { payoutProcessed: true }
            });
        });

        logger.info(`[OrderService] Payouts completed for order ${orderId}:`);
        logger.info(`  - Customer paid: $${orderValue.toNumber()}`);
        logger.info(`  - Worker deposit returned: $${depositAmount.toNumber()}`);
        logger.info(`  - Worker earned: $${workerPayout.toNumber()}`);
        logger.info(`  - Support earned: $${supportPayout.toNumber()}`);
        logger.info(`  - System profit: $${order.systemPayout || 0}`);
    }

    /**
     * Cancel order and process refund
     */
    async cancelOrder(data: CancelOrderDto) {
        const order = await this.getOrderById(data.orderId);

        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
            throw new BadRequestError(`Order cannot be cancelled in ${order.status} status`);
        }

        let refundAmount = 0;
        if (data.refundType === "full") {
            refundAmount = order.depositAmount.toNumber();
        } else if (data.refundType === "partial" && data.refundAmount) {
            refundAmount = data.refundAmount;
        }

        await prisma.order.update({
            where: { id: data.orderId },
            data: {
                status: OrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancellationReason: data.cancellationReason,
            },
        });

        await prisma.orderStatusHistory.create({
            data: {
                orderId: data.orderId,
                fromStatus: order.status,
                toStatus: OrderStatus.CANCELLED,
                changedById: data.cancelledById,
                reason: data.cancellationReason,
            },
        });

        if (refundAmount > 0) {
            const customerWallet = await this.walletService.getWalletByUserId(order.customerId);
            if (customerWallet) {
                const newPendingBalance = new Decimal(customerWallet.pendingBalance.toString()).minus(
                    order.depositAmount.toString()
                );

                const newBalance = new Decimal(customerWallet.balance.toString()).plus(refundAmount);

                await prisma.wallet.update({
                    where: { id: customerWallet.id },
                    data: {
                        balance: newBalance.toNumber(),
                        pendingBalance: newPendingBalance.toNumber(),
                    },
                });

                await prisma.walletTransaction.create({
                    data: {
                        walletId: customerWallet.id,
                        type: "REFUND",
                        amount: refundAmount,
                        balanceBefore: customerWallet.balance.toNumber(),
                        balanceAfter: newBalance.toNumber(),
                        status: "COMPLETED",
                        orderId: order.id,
                        reference: `Order #${order.orderNumber} cancelled - Refund`,
                        notes: data.cancellationReason,
                        createdById: data.cancelledById,
                    },
                });
            }
        }

        logger.info(`[OrderService] Order ${data.orderId} cancelled with ${data.refundType} refund`);

        return this.getOrderById(data.orderId);
    }

    async getOrderStats() {
        const totalOrders = await prisma.order.count();

        const ordersByStatus = await prisma.order.groupBy({
            by: ["status"],
            _count: { id: true },
        });

        const revenueResult = await prisma.order.aggregate({
            where: { status: { in: ["COMPLETED"] } },
            _sum: { orderValue: true },
        });

        const pendingOrders = await prisma.order.count({ where: { status: "PENDING" } });
        const inProgressOrders = await prisma.order.count({ where: { status: "IN_PROGRESS" } });
        const completedOrders = await prisma.order.count({ where: { status: "COMPLETED" } });
        const cancelledOrders = await prisma.order.count({ where: { status: "CANCELLED" } });
        const disputedOrders = await prisma.order.count({ where: { status: "DISPUTED" } });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ordersToday = await prisma.order.count({
            where: { createdAt: { gte: today } },
        });

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const ordersThisWeek = await prisma.order.count({
            where: { createdAt: { gte: weekAgo } },
        });

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const ordersThisMonth = await prisma.order.count({
            where: { createdAt: { gte: monthStart } },
        });

        const avgOrderValue = await prisma.order.aggregate({
            where: { status: { notIn: ["CANCELLED"] } },
            _avg: { orderValue: true },
        });

        return {
            totalOrders,
            ordersByStatus: ordersByStatus.map((item) => ({
                status: item.status,
                count: item._count.id,
            })),
            totalRevenue: revenueResult._sum.orderValue
                ? parseFloat(revenueResult._sum.orderValue.toString())
                : 0,
            pendingOrders,
            inProgressOrders,
            completedOrders,
            cancelledOrders,
            disputedOrders,
            ordersToday,
            ordersThisWeek,
            ordersThisMonth,
            averageOrderValue: avgOrderValue._avg.orderValue
                ? parseFloat(avgOrderValue._avg.orderValue.toString())
                : 0,
        };
    }

    async getOrderVolumeStats(query: { days?: number; startDate?: string; endDate?: string }) {
        let startDate: Date;
        let endDate: Date;
        let days: number;

        if (query.startDate && query.endDate) {
            startDate = new Date(query.startDate);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(query.endDate);
            endDate.setHours(23, 59, 59, 999);
            days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        } else {
            days = query.days || 30;
            startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
        }

        const orders = await prisma.order.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            select: {
                createdAt: true,
                orderValue: true,
                status: true,
            },
            orderBy: { createdAt: "asc" },
        });

        const volumeByDate = new Map<string, { count: number; value: number }>();

        orders.forEach((order) => {
            const dateKey = order.createdAt.toISOString().split("T")[0];
            const existing = volumeByDate.get(dateKey) || { count: 0, value: 0 };
            volumeByDate.set(dateKey, {
                count: existing.count + 1,
                value: existing.value + parseFloat(order.orderValue.toString()),
            });
        });

        const result = [];
        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const dateKey = date.toISOString().split("T")[0];
            const data = volumeByDate.get(dateKey) || { count: 0, value: 0 };
            result.push({
                date: dateKey,
                count: data.count,
                value: data.value,
            });
        }

        return result;
    }

    async getRecentActivity() {
        const recentOrders = await prisma.order.findMany({
            take: 20,
            orderBy: { createdAt: "desc" },
            include: {
                customer: {
                    select: {
                        id: true,
                        username: true,
                        discordId: true,
                    },
                },
                worker: {
                    select: {
                        id: true,
                        username: true,
                        discordId: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return recentOrders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            status: order.status,
            orderValue: parseFloat(order.orderValue.toString()),
            currency: order.currency,
            customer: order.customer,
            worker: order.worker,
            service: order.service,
            createdAt: order.createdAt,
        }));
    }

    async getOrderHistory(orderId: string) {
        const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: { statusHistory: true },
        });

        if (!order) {
            throw new NotFoundError("Order not found");
        }

        return order.statusHistory || [];
    }

    async getOrdersForExport(query: GetOrderListDto) {
        const orders = await prisma.order.findMany({
            where: this.buildOrderFilters(query),
            include: {
                customer: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                worker: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                support: {
                    select: {
                        username: true,
                        email: true,
                    },
                },
                service: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return orders.map((order) => ({
            orderNumber: order.orderNumber,
            status: order.status,
            customer: order.customer?.username || "N/A",
            worker: order.worker?.username || "Unassigned",
            support: order.support?.username || "N/A",
            service: order.service?.name || "N/A",
            orderValue: parseFloat(order.orderValue.toString()),
            depositAmount: parseFloat(order.depositAmount.toString()),
            currency: order.currency,
            createdAt: order.createdAt,
            completedAt: order.completedAt,
        }));
    }

    private buildOrderFilters(query: GetOrderListDto) {
        const filters: any = {};

        if (query.status) {
            filters.status = query.status;
        }

        if (query.customerId) {
            filters.customerId = query.customerId;
        }

        if (query.workerId) {
            filters.workerId = query.workerId;
        }

        if (query.serviceId) {
            filters.serviceId = query.serviceId;
        }

        if (query.startDate || query.endDate) {
            filters.createdAt = {};
            if (query.startDate) {
                filters.createdAt.gte = new Date(query.startDate);
            }
            if (query.endDate) {
                filters.createdAt.lte = new Date(query.endDate);
            }
        }

        return filters;
    }

    async getOrderByNumber(orderNumber: string) {
        const orderNum = parseInt(orderNumber);
        if (isNaN(orderNum) || orderNum <= 0) {
            throw new BadRequestError("Order number must be a positive integer");
        }

        const order = await prisma.order.findUnique({
            where: { orderNumber: orderNum },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                worker: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                support: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                    },
                },
                service: true,
                method: true,
                paymentMethod: true,
                ticket: true,
            },
        });

        if (!order) {
            throw new NotFoundError(`Order #${orderNumber} not found`);
        }

        return order;
    }

    async getOrdersByDiscordId(discordId: string, query: GetOrderListDto) {
        const user = await prisma.user.findUnique({
            where: { discordId },
        });

        if (!user) {
            throw new NotFoundError("User not found");
        }

        const { page, limit, sortBy, sortOrder } = query;
        const skip = (page! - 1) * limit!;

        const where: any = {
            OR: [
                { customerId: user.id },
                { workerId: user.id },
            ],
        };

        if (query.status) {
            where.status = query.status;
        }

        const [orders, total] = await Promise.all([
            prisma.order.findMany({
                where,
                include: {
                    customer: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            discordId: true,
                        },
                    },
                    worker: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            discordId: true,
                        },
                    },
                    service: true,
                    method: true,
                },
                skip,
                take: limit,
                orderBy: { [sortBy!]: sortOrder },
            }),
            prisma.order.count({ where }),
        ]);

        return {
            list: orders,
            total,
            page: page!,
            limit: limit!,
            totalPages: Math.ceil(total / limit!),
        };
    }

    async assignWorkerByDiscordId(orderId: string, data: { workerDiscordId: string; assignedByDiscordId: string; notes?: string }) {
        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found");
        }

        const assignedBy = await prisma.user.findUnique({
            where: { discordId: data.assignedByDiscordId },
        });

        if (!assignedBy) {
            throw new NotFoundError("Assigner not found");
        }

        return this.assignWorker(orderId, {
            workerId: worker.id,
            assignedById: assignedBy.id,
            notes: data.notes,
        });
    }

    async startOrderByDiscordId(orderId: string, workerDiscordId: string) {
        const order = await this.getOrderById(orderId);

        const worker = await prisma.user.findUnique({
            where: { discordId: workerDiscordId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found");
        }

        if (order.workerId !== worker.id) {
            throw new BadRequestError("Only assigned worker can start this order");
        }

        if (order.status !== OrderStatus.ASSIGNED) {
            throw new BadRequestError("Order must be ASSIGNED to start");
        }

        return this.updateOrderStatus(orderId, {
            status: OrderStatus.IN_PROGRESS,
            changedById: worker.id,
            reason: "Worker started order",
        });
    }

    async completeOrderByDiscordId(orderId: string, data: { workerDiscordId: string; completionNotes?: string }) {
        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found");
        }

        return this.completeOrder({
            orderId,
            workerId: worker.id,
            completionNotes: data.completionNotes,
        });
    }

    async confirmOrderByDiscordId(orderId: string, data: { customerDiscordId: string; feedback?: string }) {
        const customer = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId },
        });

        if (!customer) {
            throw new NotFoundError("Customer not found");
        }

        return this.confirmOrderCompletion({
            orderId,
            customerId: customer.id,
            feedback: data.feedback,
        });
    }

    async cancelOrderByDiscordId(orderId: string, data: {
        cancelledByDiscordId: string;
        cancellationReason: string;
        refundType?: "full" | "partial" | "none";
        refundAmount?: number;
    }) {
        const cancelledBy = await prisma.user.findUnique({
            where: { discordId: data.cancelledByDiscordId },
        });

        if (!cancelledBy) {
            throw new NotFoundError("User not found");
        }

        return this.cancelOrder({
            orderId,
            cancelledById: cancelledBy.id,
            cancellationReason: data.cancellationReason,
            refundType: data.refundType,
            refundAmount: data.refundAmount,
        });
    }

    async updateOrderChannel(orderId: string, data: { orderChannelId: string; claimMessageId?: string }) {
        return await prisma.order.update({
            where: { id: orderId },
            data: {
                orderChannelId: data.orderChannelId,
                claimMessageId: data.claimMessageId,
            },
        });
    }

    async updateOrderMessage(orderId: string, data: {
        ticketChannelId?: string;
        pinnedMessageId?: string;
    }) {
        return await prisma.order.update({
            where: { id: orderId },
            data: {
                ticketChannelId: data.ticketChannelId,
                pinnedMessageId: data.pinnedMessageId,
            },
        });
    }

    async submitOrderReview(orderId: string, data: {
        customerDiscordId: string;
        rating: number;
        review?: string;
    }) {
        const customer = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId }
        });
        if (!customer) throw new NotFoundError("Customer not found");

        if (data.rating < 1 || data.rating > 5) {
            throw new BadRequestError("Rating must be between 1 and 5");
        }

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true }
        });

        if (!order) throw new NotFoundError("Order not found");
        if (order.customerId !== customer.id) {
            throw new BadRequestError("You are not the customer for this order");
        }

        if (order.rating || order.review) {
            throw new BadRequestError("Order has already been reviewed");
        }

        return await prisma.order.update({
            where: { id: orderId },
            data: {
                rating: data.rating,
                review: data.review,
                reviewedAt: new Date(),
            },
        });
    }

    async reportIssue(orderId: string, data: {
        reportedByDiscordId: string;
        issueDescription: string;
        priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    }) {
        const reporter = await prisma.user.findUnique({
            where: { discordId: data.reportedByDiscordId }
        });
        if (!reporter) throw new NotFoundError("Reporter not found");

        const order = await prisma.order.findUnique({
            where: { id: orderId },
            include: { customer: true, worker: true, support: true }
        });

        if (!order) throw new NotFoundError("Order not found");

        if (order.customerId !== reporter.id) {
            throw new BadRequestError("Only the customer can report an issue for this order");
        }

        const issue = await prisma.orderIssue.create({
            data: {
                orderId,
                reportedById: reporter.id,
                issueDescription: data.issueDescription,
                priority: data.priority || "MEDIUM",
                status: "OPEN",
            },
            include: {
                order: {
                    include: {
                        customer: true,
                        worker: true,
                        support: true,
                    }
                },
                reportedBy: true,
            }
        });

        await this.updateOrderStatus(orderId, {
            status: "DISPUTED" as any,
            changedById: reporter.id,
            reason: "Customer reported issue",
            notes: data.issueDescription,
        });

        return issue;
    }

    async getIssue(issueId: string) {
        const issue = await prisma.orderIssue.findUnique({
            where: { id: issueId },
            include: {
                order: {
                    include: {
                        customer: true,
                        worker: true,
                        support: true,
                    }
                },
                reportedBy: true,
                resolvedBy: true,
            }
        });

        if (!issue) {
            throw new NotFoundError("Issue not found");
        }

        return issue;
    }

    async updateIssue(issueId: string, data: {
        discordMessageId?: string;
        discordChannelId?: string;
        status?: string;
        resolution?: string;
        resolvedByDiscordId?: string;
    }) {
        const updateData: any = {};

        if (data.discordMessageId) updateData.discordMessageId = data.discordMessageId;
        if (data.discordChannelId) updateData.discordChannelId = data.discordChannelId;
        if (data.status) updateData.status = data.status;
        if (data.resolution) updateData.resolution = data.resolution;

        if (data.resolvedByDiscordId) {
            const resolver = await prisma.user.findUnique({
                where: { discordId: data.resolvedByDiscordId }
            });
            if (resolver) {
                updateData.resolvedById = resolver.id;
            }
        }

        if (data.status === 'RESOLVED' && !updateData.resolvedAt) {
            updateData.resolvedAt = new Date();
        }

        return await prisma.orderIssue.update({
            where: { id: issueId },
            data: updateData,
        });
    }

    async updateOrderStatusByDiscordId(orderId: string, data: {
        status: string;
        changedByDiscordId?: string;
        workerDiscordId?: string;
        reason?: string;
        notes?: string;
        isAdminOverride?: boolean;
    }) {
        const discordId = data.changedByDiscordId || data.workerDiscordId;

        if (!discordId) {
            throw new BadRequestError("Either changedByDiscordId or workerDiscordId is required");
        }

        const changedBy = await prisma.user.findUnique({
            where: { discordId },
            select: { id: true, role: true, fullname: true }
        });
        if (!changedBy) throw new NotFoundError("User not found");

        const isAdmin = changedBy.role === 'admin' || changedBy.role === 'system' || data.isAdminOverride === true;

        const order = await this.getOrderById(orderId);

        if (order.workerId && !isAdmin) {
            if (order.worker?.discordId !== discordId) {
                throw new BadRequestError(
                    `Only the assigned worker can change this order's status. This order is assigned to ${order.worker?.fullname || 'another worker'}.`
                );
            }
        }

        return await this.updateOrderStatus(orderId, {
            status: data.status as any,
            changedById: changedBy.id,
            reason: data.reason || `Status changed to ${data.status}`,
            notes: data.notes,
        });
    }
}
