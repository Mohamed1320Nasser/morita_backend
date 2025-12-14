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

@Service()
export default class OrderService {
    constructor(private walletService: WalletService) {}

    async createOrder(data: CreateOrderDto) {
        logger.info(`[OrderService] Creating order for customer ${data.customerId}`);

        // Validate customer exists
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

        // Validate customer has sufficient balance
        let customerWallet = await this.walletService.getWalletByUserId(
            data.customerId
        );

        if (!customerWallet) {
            throw new BadRequestError("Customer does not have a wallet");
        }

        const availableBalance = new Decimal(customerWallet.balance.toString());
        const requiredDeposit = new Decimal(data.depositAmount);

        if (availableBalance.lessThan(requiredDeposit)) {
            throw new BadRequestError(
                `Insufficient balance. Required: ${requiredDeposit.toString()}, Available: ${availableBalance.toString()}`
            );
        }

        // If worker is assigned, validate worker exists and has sufficient balance
        if (data.workerId) {
            const worker = await prisma.user.findUnique({
                where: { id: data.workerId },
            });

            if (!worker) {
                throw new NotFoundError("Worker not found");
            }

            const workerWallet = await this.walletService.getWalletByUserId(
                data.workerId
            );

            if (!workerWallet) {
                throw new BadRequestError("Worker does not have a wallet");
            }

            const workerBalance = new Decimal(workerWallet.balance.toString());
            if (workerBalance.lessThan(requiredDeposit)) {
                throw new BadRequestError(
                    `Worker has insufficient balance for deposit`
                );
            }
        }

        // Calculate payouts (80% worker, 5% support, 15% system)
        const orderValue = new Decimal(data.orderValue);
        const workerPayout = orderValue.mul(0.8);
        const supportPayout = orderValue.mul(0.05);
        const systemPayout = orderValue.mul(0.15);

        // Get next order number (manual increment since MySQL doesn't support autoincrement on non-PK)
        const lastOrder = await prisma.order.findFirst({
            orderBy: { orderNumber: "desc" },
            select: { orderNumber: true },
        });
        const nextOrderNumber = (lastOrder?.orderNumber || 0) + 1;

        // Create order
        const order = await prisma.order.create({
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

        // Book customer balance (move to pending)
        customerWallet = await this.walletService.getWalletByUserId(data.customerId);
        if (customerWallet) {
            await this.walletService.deductBalance(customerWallet.id, {
                amount: data.depositAmount,
                orderId: order.id,
                notes: `Order #${order.orderNumber} - Deposit locked`,
                lockAsPending: true,
            }, data.customerId);
        }

        // Create status history
        await prisma.orderStatusHistory.create({
            data: {
                orderId: order.id,
                fromStatus: null,
                toStatus: order.status,
                changedById: data.supportId || data.customerId,
                reason: "Order created",
            },
        });

        // Update ticket status if linked
        if (data.ticketId) {
            await prisma.ticket.update({
                where: { id: data.ticketId },
                data: { status: "IN_PROGRESS" },
            });
        }

        logger.info(`[OrderService] Order created: ${order.id} (#${order.orderNumber})`);

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
            where.OR = [
                { orderNumber: { contains: search } },
                { customer: { fullname: { contains: search } } },
                { worker: { fullname: { contains: search } } },
            ];
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

        // Check worker balance
        const workerWallet = await this.walletService.getWalletByUserId(data.workerId);
        if (!workerWallet) {
            throw new BadRequestError("Worker does not have a wallet");
        }

        const workerBalance = new Decimal(workerWallet.balance.toString());
        const requiredDeposit = new Decimal(order.depositAmount.toString());

        if (workerBalance.lessThan(requiredDeposit)) {
            throw new BadRequestError("Worker has insufficient balance for deposit");
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
     * Worker claims an unassigned order (from job claiming channel)
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

        // Check worker balance
        const workerWallet = await this.walletService.getWalletByUserId(worker.id);
        if (!workerWallet) {
            throw new BadRequestError("You do not have a wallet. Please contact support.");
        }

        const workerBalance = new Decimal(workerWallet.balance.toString());
        const workerPending = new Decimal(workerWallet.pendingBalance.toString());
        const availableBalance = workerBalance.minus(workerPending);
        const requiredDeposit = new Decimal(order.depositAmount.toString());

        if (availableBalance.lessThan(requiredDeposit)) {
            throw new BadRequestError(
                `Insufficient balance. Required: $${requiredDeposit.toFixed(2)}, Available: $${availableBalance.toFixed(2)}`
            );
        }

        // Update order - assign worker
        const updatedOrder = await prisma.order.update({
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

        // Create status history
        await prisma.orderStatusHistory.create({
            data: {
                orderId,
                fromStatus: order.status,
                toStatus: OrderStatus.ASSIGNED,
                changedById: worker.id,
                reason: "Job claimed by worker",
            },
        });

        logger.info(
            `[OrderService] Worker ${worker.id} (${data.workerDiscordId}) claimed order ${orderId}`
        );

        return updatedOrder;
    }

    /**
     * Update order status
     */
    async updateOrderStatus(orderId: string, data: UpdateOrderStatusDto) {
        const order = await this.getOrderById(orderId);

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
     * Process order payouts (80% worker, 5% support, 15% system)
     */
    private async processOrderPayouts(orderId: string) {
        const order = await this.getOrderById(orderId);

        if (!order.workerId || !order.supportId) {
            logger.error(`[OrderService] Cannot process payouts: missing worker or support for order ${orderId}`);
            throw new BadRequestError("Cannot process payouts: missing worker or support");
        }

        logger.info(`[OrderService] Processing payouts for order ${orderId}`);

        // Release customer's pending balance
        const customerWallet = await this.walletService.getWalletByUserId(order.customerId);
        if (customerWallet) {
            const newPendingBalance = new Decimal(customerWallet.pendingBalance.toString()).minus(
                order.depositAmount.toString()
            );

            await prisma.wallet.update({
                where: { id: customerWallet.id },
                data: {
                    pendingBalance: newPendingBalance.toNumber(),
                },
            });

            // Create release transaction
            await prisma.walletTransaction.create({
                data: {
                    walletId: customerWallet.id,
                    type: "RELEASE",
                    amount: -order.depositAmount.toNumber(),
                    balanceBefore: customerWallet.balance.toNumber(),
                    balanceAfter: customerWallet.balance.toNumber(),
                    status: "COMPLETED",
                    orderId: order.id,
                    reference: `Order #${order.orderNumber} completed - Deposit released`,
                    createdById: order.customerId,
                },
            });
        }

        // Pay worker (80%)
        const workerWallet = await this.walletService.getWalletByUserId(order.worker!.id);
        if (workerWallet) {
            await this.walletService.addBalance(workerWallet.id, {
                amount: order.workerPayout!.toNumber(),
                transactionType: WalletTransactionType.EARNING,
                reference: `Order #${order.orderNumber} - Worker payout`,
                notes: `80% of order value`,
            }, order.customerId);
        }

        // Pay support (5%)
        const supportWallet = await this.walletService.getWalletByUserId(order.support!.id);
        if (supportWallet) {
            await this.walletService.addBalance(supportWallet.id, {
                amount: order.supportPayout!.toNumber(),
                transactionType: WalletTransactionType.COMMISSION,
                reference: `Order #${order.orderNumber} - Support commission`,
                notes: `5% of order value`,
            }, order.customerId);
        }

        // System fee (15%) - Tracked in order.systemPayout
        // No need to add to wallet as it's aggregated via getSystemWallet()

        logger.info(`[OrderService] Payouts processed for order ${orderId}`);
    }

    /**
     * Cancel order and process refund
     */
    async cancelOrder(data: CancelOrderDto) {
        const order = await this.getOrderById(data.orderId);

        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
            throw new BadRequestError(`Order cannot be cancelled in ${order.status} status`);
        }

        // Calculate refund amount
        let refundAmount = 0;
        if (data.refundType === "full") {
            refundAmount = order.depositAmount.toNumber();
        } else if (data.refundType === "partial" && data.refundAmount) {
            refundAmount = data.refundAmount;
        }

        // Update order
        await prisma.order.update({
            where: { id: data.orderId },
            data: {
                status: OrderStatus.CANCELLED,
                cancelledAt: new Date(),
                cancellationReason: data.cancellationReason,
            },
        });

        // Create status history
        await prisma.orderStatusHistory.create({
            data: {
                orderId: data.orderId,
                fromStatus: order.status,
                toStatus: OrderStatus.CANCELLED,
                changedById: data.cancelledById,
                reason: data.cancellationReason,
            },
        });

        // Process refund if applicable
        if (refundAmount > 0) {
            const customerWallet = await this.walletService.getWalletByUserId(order.customerId);
            if (customerWallet) {
                // Release from pending balance
                const newPendingBalance = new Decimal(customerWallet.pendingBalance.toString()).minus(
                    order.depositAmount.toString()
                );

                // Add back to balance
                const newBalance = new Decimal(customerWallet.balance.toString()).plus(refundAmount);

                await prisma.wallet.update({
                    where: { id: customerWallet.id },
                    data: {
                        balance: newBalance.toNumber(),
                        pendingBalance: newPendingBalance.toNumber(),
                    },
                });

                // Create refund transaction
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
