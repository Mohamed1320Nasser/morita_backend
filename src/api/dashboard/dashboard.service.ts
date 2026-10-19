import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import WalletService from "../wallet/wallet.service";
import { startOfBusinessDay, startOfBusinessMonth } from "../../common/utils/businessTime.util";

// Members who joined through Discord often have no username, which showed as
// "null registered"; fall back to their Discord names.
const displayNameSelect = {
    username: true,
    discordUsername: true,
    discordDisplayName: true,
    discordId: true,
} as const;

const displayName = (
    user: { username: string | null; discordUsername: string | null; discordDisplayName: string | null; discordId: string | null } | null | undefined
) => user ? user.discordDisplayName || user.discordUsername || user.username || user.discordId : undefined;

@Service()
export default class DashboardService {
    constructor(private walletService: WalletService) {}

    public async getStats() {
        const [categoriesCount, servicesCount] = await Promise.all([
            prisma.serviceCategory.count({ where: { deletedAt: null } }),
            prisma.service.count({ where: { deletedAt: null } }),
        ]);

        return { categoriesCount, servicesCount };
    }

    public async getTopServices(limit: number = 5) {
        const services = await prisma.service.findMany({
            where: { deletedAt: null },
            select: {
                id: true,
                name: true,
                slug: true,
                emoji: true,
                createdAt: true,
                pricingMethods: {
                    where: { deletedAt: null, active: true },
                    select: { id: true },
                },
                category: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { createdAt: "desc" },
            take: limit,
        });

        return services.map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            emoji: s.emoji,
            category: s.category,
            pricingMethodCount: s.pricingMethods.length,
            createdAt: s.createdAt,
        }));
    }

    public async getAdminDashboardStats() {
        // Day and month boundaries on the business clock, as in the KPIs
        const today = startOfBusinessDay();
        const monthStart = startOfBusinessMonth();
        const lastMonthStart = startOfBusinessMonth(new Date(), 1);

        const [
            totalOrders,
            pendingOrders,
            inProgressOrders,
            completedOrders,
            totalRevenue,
            totalWallets,
            totalBalance,
            totalPendingBalance,
            totalUsers,
            activeCustomers,
            activeWorkers,
            totalTransactions,
            todayTransactions,
            todayOrders,
            todayRevenue,
            monthOrders,
            monthRevenue,
            lastMonthOrders,
            lastMonthRevenue,
            lastMonthUsers,
            newUsersThisMonth,
            completedOrdersThisMonth,
            completedOrdersLastMonth,
            activeUsers,
            systemWallet,
        ] = await Promise.all([
            prisma.order.count(),
            prisma.order.count({ where: { status: "PENDING" } }),
            prisma.order.count({ where: { status: "IN_PROGRESS" } }),
            prisma.order.count({ where: { status: "COMPLETED" } }),
            prisma.order.aggregate({
                where: { status: "COMPLETED" },
                _sum: { orderValue: true },
            }),
            prisma.wallet.count(),
            prisma.wallet.aggregate({ _sum: { balance: true } }),
            prisma.wallet.aggregate({ _sum: { pendingBalance: true } }),
            prisma.user.count(),
            prisma.user.count({ where: { customerOrders: { some: {} } } }),
            prisma.user.count({ where: { workerOrders: { some: {} } } }),
            prisma.walletTransaction.count(),
            prisma.walletTransaction.count({
                where: { createdAt: { gte: today } },
            }),
            prisma.order.count({ where: { createdAt: { gte: today } } }),
            prisma.order.aggregate({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: today },
                },
                _sum: { orderValue: true },
            }),
            prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
            prisma.order.aggregate({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: monthStart },
                },
                _sum: { orderValue: true },
            }),
            prisma.order.count({
                where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
            }),
            prisma.order.aggregate({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: lastMonthStart, lt: monthStart },
                },
                _sum: { orderValue: true },
            }),
            prisma.user.count({
                where: { createdAt: { gte: lastMonthStart, lt: monthStart } },
            }),
            prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
            prisma.order.findMany({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: monthStart },
                },
                select: { systemPayout: true },
            }),
            prisma.order.findMany({
                where: {
                    status: "COMPLETED",
                    completedAt: { gte: lastMonthStart, lt: monthStart },
                },
                select: { systemPayout: true },
            }),
            prisma.session.count({ where: { expired: false } }),
            this.walletService.getSystemWallet(),
        ]);

        // Operating expenses come off profit here too, so the home page and
        // KPIs > Financial show the same net profit
        const [monthExpenses, lastMonthExpenses] = await Promise.all([
            prisma.operationalExpense.aggregate({
                where: { date: { gte: monthStart } },
                _sum: { amount: true },
            }),
            prisma.operationalExpense.aggregate({
                where: { date: { gte: lastMonthStart, lt: monthStart } },
                _sum: { amount: true },
            }),
        ]);
        const expensesThisMonth = Number(monthExpenses._sum.amount || 0);
        const expensesLastMonth = Number(lastMonthExpenses._sum.amount || 0);

        const orderGrowth = lastMonthOrders > 0
            ? ((monthOrders - lastMonthOrders) / lastMonthOrders) * 100
            : 0;

        const revenueThisMonth = monthRevenue._sum.orderValue
            ? new Decimal(monthRevenue._sum.orderValue.toString()).toNumber()
            : 0;

        const revenueLastMonth = lastMonthRevenue._sum.orderValue
            ? new Decimal(lastMonthRevenue._sum.orderValue.toString()).toNumber()
            : 0;

        const revenueGrowth = revenueLastMonth > 0
            ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
            : 0;

        const userGrowth = lastMonthUsers > 0
            ? ((newUsersThisMonth - lastMonthUsers) / lastMonthUsers) * 100
            : 0;

        const netProfit = completedOrdersThisMonth.reduce((sum, order) => {
            return sum + (order.systemPayout
                ? new Decimal(order.systemPayout.toString()).toNumber()
                : 0);
        }, 0) - expensesThisMonth;

        const profitMargin = revenueThisMonth > 0
            ? (netProfit / revenueThisMonth) * 100
            : 0;

        const lastMonthProfit = completedOrdersLastMonth.reduce((sum, order) => {
            return sum + (order.systemPayout
                ? new Decimal(order.systemPayout.toString()).toNumber()
                : 0);
        }, 0) - expensesLastMonth;

        const profitGrowth = lastMonthProfit > 0
            ? ((netProfit - lastMonthProfit) / lastMonthProfit) * 100
            : 0;

        return {
            orders: {
                total: totalOrders,
                pending: pendingOrders,
                inProgress: inProgressOrders,
                completed: completedOrders,
                today: todayOrders,
                thisMonth: monthOrders,
                lastMonth: lastMonthOrders,
                growth: Math.round(orderGrowth * 10) / 10,
            },
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
                thisMonth: revenueThisMonth,
                lastMonth: revenueLastMonth,
                growth: Math.round(revenueGrowth * 10) / 10,
            },
            profit: {
                net: Math.round(netProfit * 100) / 100,
                margin: Math.round(profitMargin * 10) / 10,
                thisMonth: Math.round(netProfit * 100) / 100,
                lastMonth: Math.round(lastMonthProfit * 100) / 100,
                growth: Math.round(profitGrowth * 10) / 10,
            },
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
            users: {
                total: totalUsers,
                active: activeUsers,
                activeCustomers,
                activeWorkers,
                newThisMonth: newUsersThisMonth,
                newLastMonth: lastMonthUsers,
                growth: Math.round(userGrowth * 10) / 10,
            },
            transactions: {
                total: totalTransactions,
                today: todayTransactions,
            },
            systemWallet,
        };
    }

    public async getRecentActivity() {
        const recentOrders = await prisma.order.findMany({
            take: 20,
            orderBy: { createdAt: "desc" },
            include: {
                customer: { select: displayNameSelect },
                worker: { select: displayNameSelect },
            },
        });

        const recentTransactions = await prisma.walletTransaction.findMany({
            take: 20,
            orderBy: { createdAt: "desc" },
            include: {
                wallet: {
                    include: {
                        user: { select: displayNameSelect },
                    },
                },
            },
        });

        const recentUsers = await prisma.user.findMany({
            take: 10,
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                ...displayNameSelect,
                role: true,
                createdAt: true,
            },
        });

        const activities = [
            ...recentOrders.map((order) => ({
                type: "order",
                action: "created",
                timestamp: order.createdAt,
                data: {
                    orderNumber: order.orderNumber,
                    status: order.status,
                    customer: displayName(order.customer),
                    worker: displayName(order.worker),
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
                    username: displayName(tx.wallet.user),
                    walletType: tx.wallet.walletType,
                    status: tx.status,
                },
            })),
            ...recentUsers.map((user) => ({
                type: "user",
                action: "registered",
                timestamp: user.createdAt,
                data: {
                    username: displayName(user),
                    role: user.role,
                },
            })),
        ]
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, 50);

        return activities;
    }

    public async getSystemHealth() {
        const dbHealthy = await prisma.$queryRaw`SELECT 1 as healthy`;

        const pendingOrders = await prisma.order.count({
            where: { status: "PENDING" },
        });

        const pendingTransactions = await prisma.walletTransaction.count({
            where: { status: "PENDING" },
        });

        const disputedOrders = await prisma.order.count({
            where: { status: "DISPUTED" },
        });

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const stalePendingOrders = await prisma.order.count({
            where: {
                status: "PENDING",
                createdAt: { lt: yesterday },
            },
        });

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const stuckInProgressOrders = await prisma.order.count({
            where: {
                status: "IN_PROGRESS",
                startedAt: { lt: weekAgo },
            },
        });

        return {
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
        };
    }
}
