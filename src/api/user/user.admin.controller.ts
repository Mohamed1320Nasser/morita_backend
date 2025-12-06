import {
    JsonController,
    Get,
    Post,
    Put,
    Param,
    Body,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import API from "../../common/config/api.types";

// Admin User Controller (for user management in admin panel)
@JsonController("/api/admin/users")
@Service()
export default class AdminUserController {
    /**
     * Get all users with enhanced filters and pagination
     */
    @Get("/")
    @Authorized(API.Role.admin)
    async getAllUsers(
        @QueryParams()
        query: {
            page?: number;
            limit?: number;
            role?: string;
            discordRole?: string;
            search?: string;
            hasWallet?: boolean;
        }
    ) {
        logger.info(`[Admin] Fetching users with filters:`, query);

        try {
            const page = parseInt(String(query.page)) || 1;
            const limit = parseInt(String(query.limit)) || 20;
            const skip = (page - 1) * limit;

            // Build filters
            const where: any = {};

            if (query.role) {
                where.role = query.role;
            }

            if (query.discordRole) {
                where.discordRole = query.discordRole;
            }

            if (query.search) {
                where.OR = [
                    { username: { contains: query.search } },
                    { email: { contains: query.search } },
                    { fullname: { contains: query.search } },
                    { discordId: { contains: query.search } },
                ];
            }

            // Get users
            const [users, total] = await Promise.all([
                prisma.user.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: "desc",
                    },
                    include: {
                        wallet: {
                            select: {
                                id: true,
                                walletType: true,
                                balance: true,
                                pendingBalance: true,
                                isActive: true,
                            },
                        },
                        customerOrders: {
                            select: {
                                id: true,
                                status: true,
                            },
                        },
                        workerOrders: {
                            select: {
                                id: true,
                                status: true,
                            },
                        },
                    },
                }),
                prisma.user.count({ where }),
            ]);

            return {
                success: true,
                data: {
                    list: users.map((user) => ({
                        ...user,
                        ordersAsCustomer: user.customerOrders.length,
                        ordersAsWorker: user.workerOrders.length,
                        // Don't send password hash to frontend
                        password: undefined,
                    })),
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get users error:`, error);
            throw error;
        }
    }

    /**
     * Get user statistics
     */
    @Get("/stats")
    @Authorized(API.Role.admin)
    async getUserStats() {
        logger.info(`[Admin] Fetching user statistics`);

        try {
            // Get total users count
            const totalUsers = await prisma.user.count();

            // Get users by role
            const usersByRole = await prisma.user.groupBy({
                by: ["role"],
                _count: {
                    id: true,
                },
            });

            // Get users with wallets
            const usersWithWallets = await prisma.user.count({
                where: {
                    wallet: {
                        isNot: null,
                    },
                },
            });

            // Get today's new users
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const newUsersToday = await prisma.user.count({
                where: {
                    createdAt: { gte: today },
                },
            });

            // Get this week's new users
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const newUsersThisWeek = await prisma.user.count({
                where: {
                    createdAt: { gte: weekAgo },
                },
            });

            // Get this month's new users
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            const newUsersThisMonth = await prisma.user.count({
                where: {
                    createdAt: { gte: monthStart },
                },
            });

            // Get active customers (users who have placed orders)
            const activeCustomers = await prisma.user.count({
                where: {
                    customerOrders: {
                        some: {},
                    },
                },
            });

            // Get active workers (users who have worked on orders)
            const activeWorkers = await prisma.user.count({
                where: {
                    workerOrders: {
                        some: {},
                    },
                },
            });

            return {
                success: true,
                data: {
                    totalUsers,
                    usersByRole: usersByRole.map((item) => ({
                        role: item.role,
                        count: item._count.id,
                    })),
                    usersWithWallets,
                    usersWithoutWallets: totalUsers - usersWithWallets,
                    newUsersToday,
                    newUsersThisWeek,
                    newUsersThisMonth,
                    activeCustomers,
                    activeWorkers,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get user stats error:`, error);
            throw error;
        }
    }

    /**
     * Get user detail by ID
     */
    @Get("/:userId")
    @Authorized(["admin", "support"])
    async getUserDetail(@Param("userId") userId: string) {
        logger.info(`[Admin] Fetching user ${userId}`);

        try {
            const user = await prisma.user.findUnique({
                where: { id: parseInt(userId) },
                include: {
                    wallet: {
                        include: {
                            transactions: {
                                take: 10,
                                orderBy: {
                                    createdAt: "desc",
                                },
                            },
                        },
                    },
                    customerOrders: {
                        take: 10,
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            id: true,
                            orderNumber: true,
                            status: true,
                            orderValue: true,
                            createdAt: true,
                        },
                    },
                    workerOrders: {
                        take: 10,
                        orderBy: {
                            createdAt: "desc",
                        },
                        select: {
                            id: true,
                            orderNumber: true,
                            status: true,
                            orderValue: true,
                            createdAt: true,
                        },
                    },
                },
            });

            if (!user) {
                throw new Error("User not found");
            }

            return {
                success: true,
                data: {
                    ...user,
                    // Don't send password hash to frontend
                    password: undefined,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get user detail error:`, error);
            throw error;
        }
    }

    /**
     * Update user role
     */
    @Put("/:userId/role")
    @Authorized(API.Role.admin)
    async updateUserRole(
        @Param("userId") userId: string,
        @Body() data: { role: string }
    ) {
        logger.info(`[Admin] Updating user ${userId} role to ${data.role}`);

        try {
            const user = await prisma.user.update({
                where: { id: parseInt(userId) },
                data: {
                    role: data.role as any,
                },
            });

            return {
                success: true,
                data: {
                    ...user,
                    password: undefined,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Update user role error:`, error);
            throw error;
        }
    }

    /**
     * Update user details
     */
    @Put("/:userId")
    @Authorized(API.Role.admin)
    async updateUser(
        @Param("userId") userId: string,
        @Body()
        data: {
            fullname?: string;
            username?: string;
            email?: string;
            phone?: string;
        }
    ) {
        logger.info(`[Admin] Updating user ${userId}`);

        try {
            const user = await prisma.user.update({
                where: { id: parseInt(userId) },
                data,
            });

            return {
                success: true,
                data: {
                    ...user,
                    password: undefined,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Update user error:`, error);
            throw error;
        }
    }

    /**
     * Get user growth chart data (last 30 days)
     */
    @Get("/stats/growth")
    @Authorized(API.Role.admin)
    async getUserGrowthStats(@QueryParams() query: { days?: number }) {
        const days = query.days || 30;
        logger.info(`[Admin] Fetching user growth for last ${days} days`);

        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);

            // Get users grouped by date
            const users = await prisma.user.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                    },
                },
                select: {
                    createdAt: true,
                    role: true,
                },
                orderBy: {
                    createdAt: "asc",
                },
            });

            // Group by date
            const growthByDate = new Map<string, { count: number; cumulative: number }>();
            let cumulativeCount = 0;

            users.forEach((user) => {
                const dateKey = user.createdAt.toISOString().split("T")[0];
                const existing = growthByDate.get(dateKey) || {
                    count: 0,
                    cumulative: cumulativeCount,
                };
                existing.count += 1;
                cumulativeCount += 1;
                existing.cumulative = cumulativeCount;
                growthByDate.set(dateKey, existing);
            });

            // Convert to array and fill missing dates
            const result = [];
            let lastCumulative = 0;
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (days - 1 - i));
                const dateKey = date.toISOString().split("T")[0];
                const data = growthByDate.get(dateKey);

                if (data) {
                    lastCumulative = data.cumulative;
                    result.push({
                        date: dateKey,
                        count: data.count,
                        cumulative: data.cumulative,
                    });
                } else {
                    result.push({
                        date: dateKey,
                        count: 0,
                        cumulative: lastCumulative,
                    });
                }
            }

            return {
                success: true,
                data: result,
            };
        } catch (error) {
            logger.error(`[Admin] Get user growth stats error:`, error);
            throw error;
        }
    }

    /**
     * Export users to CSV (returns data for CSV generation on frontend)
     */
    @Get("/export/csv")
    @Authorized(API.Role.admin)
    async exportUsers(
        @QueryParams()
        query: {
            role?: string;
            search?: string;
        }
    ) {
        logger.info(`[Admin] Exporting users to CSV`);

        try {
            // Build filters
            const where: any = {};

            if (query.role) {
                where.role = query.role;
            }

            if (query.search) {
                where.OR = [
                    { username: { contains: query.search } },
                    { email: { contains: query.search } },
                    { fullname: { contains: query.search } },
                ];
            }

            const users = await prisma.user.findMany({
                where,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    wallet: {
                        select: {
                            walletType: true,
                            balance: true,
                            isActive: true,
                        },
                    },
                },
            });

            // Format for CSV export
            const csvData = users.map((user) => ({
                id: user.id,
                username: user.username,
                email: user.email,
                fullname: user.fullname,
                phone: user.phone || "",
                role: user.role,
                discordId: user.discordId || "",
                hasWallet: user.wallet ? "Yes" : "No",
                walletType: user.wallet?.walletType || "N/A",
                balance: user.wallet?.balance || 0,
                createdAt: user.createdAt,
            }));

            return {
                success: true,
                data: csvData,
            };
        } catch (error) {
            logger.error(`[Admin] Export users error:`, error);
            throw error;
        }
    }
}
