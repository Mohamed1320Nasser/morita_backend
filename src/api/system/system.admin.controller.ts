import { JsonController, Get, Authorized } from "routing-controllers";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import { Decimal } from "@prisma/client/runtime/library";
import WalletService from "../wallet/wallet.service";
import OrderService from "../order/order.service";
import API from "../../common/config/api.types";

// System Admin Controller (for dashboard statistics and system overview)
@JsonController("/api/admin/system")
@Service()
export default class SystemAdminController {
    constructor(
        private walletService: WalletService,
        private orderService: OrderService
    ) {}

    /**
     * Get comprehensive dashboard statistics
     * This aggregates data from orders, wallets, users, and transactions
     */
    @Get("/dashboard/stats")
    @Authorized(API.Role.admin)
    async getDashboardStats() {
        logger.info(`[Admin] Fetching comprehensive dashboard statistics`);

        try {
            // Get order stats
            const [
                totalOrders,
                pendingOrders,
                inProgressOrders,
                completedOrders,
                totalRevenue,
            ] = await Promise.all([
                prisma.order.count(),
                prisma.order.count({ where: { status: "PENDING" } }),
                prisma.order.count({ where: { status: "IN_PROGRESS" } }),
                prisma.order.count({ where: { status: "COMPLETED" } }),
                prisma.order.aggregate({
                    where: { status: "COMPLETED" },
                    _sum: { orderValue: true },
                }),
            ]);

            // Get wallet stats
            const [totalWallets, totalBalance, totalPendingBalance] =
                await Promise.all([
                    prisma.wallet.count(),
                    prisma.wallet.aggregate({ _sum: { balance: true } }),
                    prisma.wallet.aggregate({ _sum: { pendingBalance: true } }),
                ]);

            // Get user stats
            const [totalUsers, activeCustomers, activeWorkers] =
                await Promise.all([
                    prisma.user.count(),
                    prisma.user.count({
                        where: { customerOrders: { some: {} } },
                    }),
                    prisma.user.count({
                        where: { workerOrders: { some: {} } },
                    }),
                ]);

            // Get transaction stats
            const [totalTransactions, todayTransactions] = await Promise.all([
                prisma.walletTransaction.count(),
                prisma.walletTransaction.count({
                    where: {
                        createdAt: {
                            gte: new Date(new Date().setHours(0, 0, 0, 0)),
                        },
                    },
                }),
            ]);

            // Get system wallet
            const systemWallet = await this.walletService.getSystemWallet();

            // Calculate today's stats
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const [todayOrders, todayRevenue] = await Promise.all([
                prisma.order.count({
                    where: { createdAt: { gte: today } },
                }),
                prisma.order.aggregate({
                    where: {
                        status: "COMPLETED",
                        completedAt: { gte: today },
                    },
                    _sum: { orderValue: true },
                }),
            ]);

            // Calculate this month's stats
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const [monthOrders, monthRevenue] = await Promise.all([
                prisma.order.count({
                    where: { createdAt: { gte: monthStart } },
                }),
                prisma.order.aggregate({
                    where: {
                        status: "COMPLETED",
                        completedAt: { gte: monthStart },
                    },
                    _sum: { orderValue: true },
                }),
            ]);

            return {
                success: true,
                data: {
                    // Order stats
                    orders: {
                        total: totalOrders,
                        pending: pendingOrders,
                        inProgress: inProgressOrders,
                        completed: completedOrders,
                        today: todayOrders,
                        thisMonth: monthOrders,
                    },
                    // Revenue stats
                    revenue: {
                        total: totalRevenue._sum.orderValue
                            ? new Decimal(
                                  totalRevenue._sum.orderValue.toString()
                              ).toNumber()
                            : 0,
                        today: todayRevenue._sum.orderValue
                            ? new Decimal(
                                  todayRevenue._sum.orderValue.toString()
                              ).toNumber()
                            : 0,
                        thisMonth: monthRevenue._sum.orderValue
                            ? new Decimal(
                                  monthRevenue._sum.orderValue.toString()
                              ).toNumber()
                            : 0,
                    },
                    // Wallet stats
                    wallets: {
                        total: totalWallets,
                        totalBalance: totalBalance._sum.balance
                            ? new Decimal(
                                  totalBalance._sum.balance.toString()
                              ).toNumber()
                            : 0,
                        totalPendingBalance: totalPendingBalance._sum
                            .pendingBalance
                            ? new Decimal(
                                  totalPendingBalance._sum.pendingBalance.toString()
                              ).toNumber()
                            : 0,
                    },
                    // User stats
                    users: {
                        total: totalUsers,
                        activeCustomers,
                        activeWorkers,
                    },
                    // Transaction stats
                    transactions: {
                        total: totalTransactions,
                        today: todayTransactions,
                    },
                    // System wallet
                    systemWallet,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get dashboard stats error:`, error);
            throw error;
        }
    }

    /**
     * Get recent activity feed (last 50 activities)
     */
    @Get("/dashboard/activity")
    @Authorized(API.Role.admin)
    async getRecentActivity() {
        logger.info(`[Admin] Fetching recent activity feed`);

        try {
            // Get recent orders
            const recentOrders = await prisma.order.findMany({
                take: 20,
                orderBy: { createdAt: "desc" },
                include: {
                    customer: {
                        select: { username: true, discordId: true },
                    },
                    worker: {
                        select: { username: true, discordId: true },
                    },
                },
            });

            // Get recent transactions
            const recentTransactions = await prisma.walletTransaction.findMany({
                take: 20,
                orderBy: { createdAt: "desc" },
                include: {
                    wallet: {
                        include: {
                            user: {
                                select: { username: true, discordId: true },
                            },
                        },
                    },
                },
            });

            // Get recent users
            const recentUsers = await prisma.user.findMany({
                take: 10,
                orderBy: { createdAt: "desc" },
                select: {
                    id: true,
                    username: true,
                    role: true,
                    createdAt: true,
                },
            });

            // Combine and sort all activities by timestamp
            const activities = [
                ...recentOrders.map((order) => ({
                    type: "order",
                    action: "created",
                    timestamp: order.createdAt,
                    data: {
                        orderNumber: order.orderNumber,
                        status: order.status,
                        customer: order.customer?.username,
                        worker: order.worker?.username,
                        orderValue: new Decimal(
                            order.orderValue.toString()
                        ).toNumber(),
                    },
                })),
                ...recentTransactions.map((tx) => ({
                    type: "transaction",
                    action: tx.type.toLowerCase(),
                    timestamp: tx.createdAt,
                    data: {
                        amount: new Decimal(tx.amount.toString()).toNumber(),
                        username: tx.wallet.user?.username,
                        walletType: tx.wallet.walletType,
                        status: tx.status,
                    },
                })),
                ...recentUsers.map((user) => ({
                    type: "user",
                    action: "registered",
                    timestamp: user.createdAt,
                    data: {
                        username: user.username,
                        role: user.role,
                    },
                })),
            ]
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, 50);

            return {
                success: true,
                data: activities,
            };
        } catch (error) {
            logger.error(`[Admin] Get recent activity error:`, error);
            throw error;
        }
    }

    /**
     * Get system health status
     */
    @Get("/health")
    @Authorized(API.Role.admin)
    async getSystemHealth() {
        logger.info(`[Admin] Fetching system health status`);

        try {
            // Check database connection
            const dbHealthy = await prisma.$queryRaw`SELECT 1 as healthy`;

            // Get pending operations count
            const pendingOrders = await prisma.order.count({
                where: { status: "PENDING" },
            });

            const pendingTransactions = await prisma.walletTransaction.count({
                where: { status: "PENDING" },
            });

            // Get disputed orders
            const disputedOrders = await prisma.order.count({
                where: { status: "DISPUTED" },
            });

            // Check for stale pending orders (older than 24 hours)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const stalePendingOrders = await prisma.order.count({
                where: {
                    status: "PENDING",
                    createdAt: { lt: yesterday },
                },
            });

            // Check for orders stuck in progress (older than 7 days)
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const stuckInProgressOrders = await prisma.order.count({
                where: {
                    status: "IN_PROGRESS",
                    startedAt: { lt: weekAgo },
                },
            });

            return {
                success: true,
                data: {
                    databaseHealthy: Array.isArray(dbHealthy) && dbHealthy.length > 0,
                    pendingOrders,
                    pendingTransactions,
                    disputedOrders,
                    stalePendingOrders,
                    stuckInProgressOrders,
                    warnings: [
                        ...(stalePendingOrders > 0
                            ? [
                                  `${stalePendingOrders} pending orders older than 24 hours`,
                              ]
                            : []),
                        ...(stuckInProgressOrders > 0
                            ? [
                                  `${stuckInProgressOrders} in-progress orders older than 7 days`,
                              ]
                            : []),
                        ...(disputedOrders > 0
                            ? [`${disputedOrders} disputed orders requiring attention`]
                            : []),
                    ],
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get system health error:`, error);
            throw error;
        }
    }

    /**
     * Get system configuration
     */
    @Get("/config")
    @Authorized(API.Role.admin)
    async getSystemConfig() {
        logger.info(`[Admin] Fetching system configuration`);

        try {
            // Get payout configuration from the first completed order as reference
            const sampleOrder = await prisma.order.findFirst({
                where: { status: "COMPLETED" },
                select: {
                    orderValue: true,
                    workerPayout: true,
                    supportPayout: true,
                    systemPayout: true,
                },
            });

            let payoutConfig = {
                workerPercentage: 80,
                supportPercentage: 5,
                systemPercentage: 15,
            };

            if (sampleOrder && sampleOrder.workerPayout && sampleOrder.supportPayout && sampleOrder.systemPayout) {
                const orderValue = new Decimal(
                    sampleOrder.orderValue.toString()
                ).toNumber();
                payoutConfig = {
                    workerPercentage:
                        (new Decimal(sampleOrder.workerPayout.toString()).toNumber() /
                            orderValue) *
                        100,
                    supportPercentage:
                        (new Decimal(sampleOrder.supportPayout.toString()).toNumber() /
                            orderValue) *
                        100,
                    systemPercentage:
                        (new Decimal(sampleOrder.systemPayout.toString()).toNumber() /
                            orderValue) *
                        100,
                };
            }

            // Get available services
            const services = await prisma.service.findMany({
                select: {
                    id: true,
                    name: true,
                    active: true,
                },
            });

            // Get available payment methods
            const paymentMethods = await prisma.paymentMethod.findMany({
                select: {
                    id: true,
                    name: true,
                    active: true,
                },
            });

            return {
                success: true,
                data: {
                    payoutConfig,
                    services,
                    paymentMethods,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get system config error:`, error);
            throw error;
        }
    }

    /**
     * Get performance metrics (average times, etc.)
     */
    @Get("/metrics/performance")
    @Authorized(API.Role.admin)
    async getPerformanceMetrics() {
        logger.info(`[Admin] Fetching performance metrics`);

        try {
            // Get completed orders with timing data
            const completedOrders = await prisma.order.findMany({
                where: {
                    status: "COMPLETED",
                    assignedAt: { not: null },
                    completedAt: { not: null },
                },
                select: {
                    createdAt: true,
                    assignedAt: true,
                    startedAt: true,
                    completedAt: true,
                    confirmedAt: true,
                },
            });

            // Calculate average times
            let avgTimeToAssign = 0;
            let avgTimeToComplete = 0;
            let avgTimeToConfirm = 0;

            if (completedOrders.length > 0) {
                const timings = completedOrders.map((order) => {
                    const timeToAssign = order.assignedAt
                        ? (order.assignedAt.getTime() -
                              order.createdAt.getTime()) /
                          1000 /
                          60
                        : 0; // minutes
                    const timeToComplete = order.completedAt
                        ? (order.completedAt.getTime() -
                              order.assignedAt!.getTime()) /
                          1000 /
                          60 /
                          60
                        : 0; // hours
                    const timeToConfirm =
                        order.confirmedAt && order.completedAt
                            ? (order.confirmedAt.getTime() -
                                  order.completedAt.getTime()) /
                              1000 /
                              60
                            : 0; // minutes

                    return { timeToAssign, timeToComplete, timeToConfirm };
                });

                avgTimeToAssign =
                    timings.reduce((sum, t) => sum + t.timeToAssign, 0) /
                    timings.length;
                avgTimeToComplete =
                    timings.reduce((sum, t) => sum + t.timeToComplete, 0) /
                    timings.length;
                avgTimeToConfirm =
                    timings.reduce((sum, t) => sum + t.timeToConfirm, 0) /
                    timings.length;
            }

            // Get success rate (completed vs cancelled)
            const [totalOrders, completedCount, cancelledCount] =
                await Promise.all([
                    prisma.order.count({
                        where: {
                            status: { in: ["COMPLETED", "CANCELLED"] },
                        },
                    }),
                    prisma.order.count({ where: { status: "COMPLETED" } }),
                    prisma.order.count({ where: { status: "CANCELLED" } }),
                ]);

            const successRate =
                totalOrders > 0 ? (completedCount / totalOrders) * 100 : 0;

            return {
                success: true,
                data: {
                    avgTimeToAssign: Math.round(avgTimeToAssign), // minutes
                    avgTimeToComplete: Math.round(avgTimeToComplete * 10) / 10, // hours
                    avgTimeToConfirm: Math.round(avgTimeToConfirm), // minutes
                    successRate: Math.round(successRate * 10) / 10, // percentage
                    completedOrders: completedCount,
                    cancelledOrders: cancelledCount,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get performance metrics error:`, error);
            throw error;
        }
    }

    /**
     * Get worker performance rankings
     */
    @Get("/metrics/worker-performance")
    @Authorized(API.Role.admin)
    async getWorkerPerformance() {
        logger.info(`[Admin] Fetching worker performance metrics`);

        try {
            // Get all workers with their order stats
            const workers = await prisma.user.findMany({
                where: {
                    workerOrders: {
                        some: {},
                    },
                },
                include: {
                    workerOrders: {
                        select: {
                            status: true,
                            orderValue: true,
                            workerPayout: true,
                            completedAt: true,
                        },
                    },
                },
            });

            // Calculate stats for each worker
            const workerStats = workers.map((worker) => {
                const orders = worker.workerOrders;
                const completedOrders = orders.filter(
                    (o) => o.status === "COMPLETED"
                );
                const totalEarnings = completedOrders.reduce(
                    (sum, order) =>
                        sum +
                        (order.workerPayout ? new Decimal(order.workerPayout.toString()).toNumber() : 0),
                    0
                );
                const totalOrderValue = completedOrders.reduce(
                    (sum, order) =>
                        sum +
                        new Decimal(order.orderValue.toString()).toNumber(),
                    0
                );

                return {
                    userId: worker.id,
                    username: worker.username,
                    discordId: worker.discordId,
                    totalOrders: orders.length,
                    completedOrders: completedOrders.length,
                    totalEarnings,
                    totalOrderValue,
                    successRate:
                        orders.length > 0
                            ? (completedOrders.length / orders.length) * 100
                            : 0,
                };
            });

            // Sort by total earnings (top performers)
            workerStats.sort((a, b) => b.totalEarnings - a.totalEarnings);

            return {
                success: true,
                data: workerStats.slice(0, 20), // Top 20 workers
            };
        } catch (error) {
            logger.error(`[Admin] Get worker performance error:`, error);
            throw error;
        }
    }
}
