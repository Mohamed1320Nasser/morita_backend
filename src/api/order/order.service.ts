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
import { withTransactionRetry, checkWalletBalanceWithLock, updateWalletBalance } from "../../common/utils/transaction.util";
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

        // Validate input amounts
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

        // NO validation between deposit and order value
        // Deposit is worker security - can be higher/lower than order value
        // Support decides deposit based on risk assessment

        // Calculate payouts (based on ORDER VALUE, not deposit)
        const orderValue = new Decimal(data.orderValue);
        const workerPayout = orderValue.mul(PAYOUT_STRUCTURE.WORKER_PERCENTAGE);
        const supportPayout = orderValue.mul(PAYOUT_STRUCTURE.SUPPORT_PERCENTAGE);
        const systemPayout = orderValue.mul(PAYOUT_STRUCTURE.SYSTEM_PERCENTAGE);
        const requiredDeposit = new Decimal(data.depositAmount);

        // Pre-validate users exist
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

        // Get customer wallet
        const customerWallet = await this.walletService.getWalletByUserId(data.customerId);
        if (!customerWallet) {
            throw new BadRequestError("Customer does not have a wallet");
        }

        // If worker assigned, validate worker
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

        // Execute in atomic transaction
        const order = await withTransactionRetry(async (tx) => {
            // 1. LOCK CUSTOMER'S ORDER VALUE
            const customerBalanceCheck = await checkWalletBalanceWithLock(
                tx,
                customerWallet.id,
                orderValue.toNumber()
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

            // 2. IF WORKER ASSIGNED: LOCK WORKER'S DEPOSIT
            if (data.workerId) {
                const workerWallet = await tx.wallet.findUnique({
                    where: { userId: data.workerId },
                });

                if (workerWallet) {
                    const workerBalanceCheck = await checkWalletBalanceWithLock(
                        tx,
                        workerWallet.id,
                        requiredDeposit.toNumber()
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

                    await updateWalletBalance(
                        tx,
                        workerWallet.id,
                        -requiredDeposit.toNumber(),
                        requiredDeposit.toNumber()
                    );

                    await tx.walletTransaction.create({
                        data: {
                            walletId: workerWallet.id,
                            type: "PAYMENT",
                            amount: requiredDeposit.neg(),
                            balanceBefore: workerBalanceCheck.wallet.balance,
                            balanceAfter: new Decimal(workerBalanceCheck.wallet.balance).sub(requiredDeposit).toNumber(),
                            currency: workerWallet.currency,
                            status: "PENDING",
                            notes: `Worker security deposit`,
                            createdById: data.workerId!, // Safe: validated at line 142
                        },
                    });
                }
            }

            // 3. CREATE ORDER
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

            // Update transactions with order ID
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

            // 4. CREATE STATUS HISTORY
            await tx.orderStatusHistory.create({
                data: {
                    orderId: createdOrder.id,
                    fromStatus: null,
                    toStatus: createdOrder.status,
                    changedById: data.supportId || data.customerId,
                    reason: "Order created",
                },
            });

            // 5. UPDATE TICKET
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

        // Find customer by Discord ID
        const customer = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId },
        });

        if (!customer) {
            throw new NotFoundError(
                `Customer with Discord ID ${data.customerDiscordId} not found`
            );
        }

        // Find support by Discord ID
        const support = await prisma.user.findUnique({
            where: { discordId: data.supportDiscordId },
        });

        if (!support) {
            throw new NotFoundError(
                `Support user with Discord ID ${data.supportDiscordId} not found`
            );
        }

        // Find worker by Discord ID if provided
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

        // Create order with user IDs
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
     * Get order list with filters
     */
    async getOrders(query: GetOrderListDto) {
        const { search, status, customerId, workerId, ticketId, page, limit, sortBy, sortOrder } = query;
        const skip = (page! - 1) * limit!;

        const where: any = {};

        if (search) {
            // Check if search is a number (order number) or text (name search)
            const isNumber = /^\d+$/.test(search);

            if (isNumber) {
                // Search by exact order number
                where.orderNumber = parseInt(search);
            } else {
                // Search by customer/worker names
                where.OR = [
                    { customer: { fullname: { contains: search } } },
                    { worker: { fullname: { contains: search } } },
                ];
            }
        }

        if (status) {
            where.status = status;
        }

        if (customerId) {
            where.customerId = customerId;
        }

        if (workerId) {
            where.workerId = workerId;
        }

        if (ticketId) {
            where.ticketId = ticketId;
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

    /**
     * Assign worker to order
     */
    async assignWorker(orderId: string, data: AssignWorkerDto) {
        const order = await this.getOrderById(orderId);

        if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CLAIMING) {
            throw new BadRequestError("Order cannot be assigned in current status");
        }

        // Validate worker
        const worker = await prisma.user.findUnique({
            where: { id: data.workerId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found");
        }

        // Check worker balance (deposit + available balance)
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

        // Update order
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

        // Create status history
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

        // Check if order is available for claiming
        if (order.status !== OrderStatus.PENDING) {
            throw new BadRequestError("Order is not available for claiming");
        }

        if (order.workerId) {
            throw new BadRequestError("Order already has a worker assigned");
        }

        // Get worker by Discord ID
        const worker = await prisma.user.findUnique({
            where: { discordId: data.workerDiscordId },
        });

        if (!worker) {
            throw new NotFoundError("Worker not found. Please ensure you have a registered account.");
        }

        // Get worker wallet
        const workerWallet = await this.walletService.getWalletByUserId(worker.id);
        if (!workerWallet) {
            throw new BadRequestError("You do not have a wallet. Please contact support.");
        }

        const requiredDeposit = new Decimal(order.depositAmount.toString());

        const updatedOrder = await withTransactionRetry(async (tx) => {
            const balanceCheck = await checkWalletBalanceWithLock(
                tx,
                workerWallet.id,
                requiredDeposit.toNumber()
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

            await updateWalletBalance(
                tx,
                workerWallet.id,
                -requiredDeposit.toNumber(), // Deduct from balance
                requiredDeposit.toNumber()   // Add to pending
            );

            await tx.walletTransaction.create({
                data: {
                    walletId: workerWallet.id,
                    orderId: order.id,
                    type: "PAYMENT",
                    amount: requiredDeposit.neg(),
                    balanceBefore: balanceCheck.wallet.balance,
                    balanceAfter: new Decimal(balanceCheck.wallet.balance).sub(requiredDeposit).toNumber(),
                    currency: workerWallet.currency,
                    status: "PENDING",
                    reference: `Order #${order.orderNumber} - Worker deposit locked`,
                    notes: `Security deposit for claiming job`,
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

        // Validate status transition (unless it's the same status)
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

        // Create status history
        await prisma.orderStatusHistory.create({
            data: {
                orderId,
                fromStatus: order.status,
                toStatus: data.status,
                changedById: data.changedById,
                reason: data.reason,
            },
        });

        // Update ticket status if linked
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
     * Customer confirms order completion (triggers payout)
     */
    async confirmOrderCompletion(data: ConfirmOrderDto) {
        const order = await this.getOrderById(data.orderId);

        if (order.customerId !== data.customerId) {
            throw new BadRequestError("Only customer can confirm order completion");
        }

        if (order.status !== OrderStatus.AWAITING_CONFIRM) {
            throw new BadRequestError("Order must be AWAITING_CONFIRM to confirm");
        }

        // Update order status
        await this.updateOrderStatus(data.orderId, {
            status: OrderStatus.COMPLETED,
            changedById: data.customerId,
            reason: "Customer confirmed completion",
            notes: data.feedback,
        });

        // Trigger payouts (80/5/15 split)
        await this.processOrderPayouts(data.orderId);

        return this.getOrderById(data.orderId);
    }

    /**
     * Validate status transition
     * Enforces proper order flow and prevents invalid status changes
     */
    private validateStatusTransition(currentStatus: PrismaOrderStatus, newStatus: OrderStatus): void {
        // Define valid transitions for each status
        const validTransitions: Record<PrismaOrderStatus, PrismaOrderStatus[]> = {
            [PrismaOrderStatus.PENDING]: [PrismaOrderStatus.CLAIMING, PrismaOrderStatus.ASSIGNED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.CLAIMING]: [PrismaOrderStatus.ASSIGNED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.ASSIGNED]: [PrismaOrderStatus.IN_PROGRESS, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.IN_PROGRESS]: [PrismaOrderStatus.AWAITING_CONFIRM, PrismaOrderStatus.CANCELLED, PrismaOrderStatus.DISPUTED],
            [PrismaOrderStatus.AWAITING_CONFIRM]: [PrismaOrderStatus.COMPLETED, PrismaOrderStatus.DISPUTED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.COMPLETED]: [PrismaOrderStatus.DISPUTED], // Can only dispute after completion
            [PrismaOrderStatus.CANCELLED]: [PrismaOrderStatus.REFUNDED],
            [PrismaOrderStatus.DISPUTED]: [PrismaOrderStatus.COMPLETED, PrismaOrderStatus.REFUNDED, PrismaOrderStatus.CANCELLED],
            [PrismaOrderStatus.REFUNDED]: [], // Final status - no transitions allowed
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

        // Idempotency check - prevent duplicate payout processing
        if (order.payoutProcessed) {
            logger.warn(`[OrderService] Payouts already processed for order ${orderId}, skipping`);
            return;
        }

        if (!order.workerId || !order.supportId) {
            logger.error(`[OrderService] Cannot process payouts: missing worker or support for order ${orderId}`);
            throw new BadRequestError("Cannot process payouts: missing worker or support");
        }

        logger.info(`[OrderService] Processing payouts for order ${orderId}`);

        // Get wallets
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

        // Process all payouts atomically
        await withTransactionRetry(async (tx) => {
            // 1. RELEASE CUSTOMER'S PENDING ORDER VALUE
            await updateWalletBalance(
                tx,
                customerWallet.id,
                0, // Balance stays same (already deducted)
                -orderValue.toNumber() // Remove from pending
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

            // 2. RELEASE WORKER'S PENDING DEPOSIT
            await updateWalletBalance(
                tx,
                workerWallet.id,
                depositAmount.toNumber(), // Add back to balance
                -depositAmount.toNumber() // Remove from pending
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
                    createdById: order.workerId!, // Safe: validated at line 802
                },
            });

            // 3. PAY WORKER (80% of order value)
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

            // 4. PAY SUPPORT (5% of order value)
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

            // 5. System revenue (15%) tracked in order.systemPayout

            // 6. Mark order as payout processed (idempotency)
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
                // Release from pending balance
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
}
