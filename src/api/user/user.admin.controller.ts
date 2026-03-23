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
import API from "../../common/config/api.types";
import UserService from "./user.service";

@JsonController("/api/admin/users")
@Service()
export default class AdminUserController {
    constructor(private userService: UserService) {}

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
        const page = parseInt(String(query.page)) || 1;
        const limit = parseInt(String(query.limit)) || 20;
        const skip = (page - 1) * limit;

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
            list: users.map((user) => ({
                ...user,
                ordersAsCustomer: user.customerOrders.length,
                ordersAsWorker: user.workerOrders.length,
                password: undefined,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    @Get("/stats")
    @Authorized(API.Role.admin)
    async getUserStats() {
        const totalUsers = await prisma.user.count();

        const usersByRole = await prisma.user.groupBy({
            by: ["role"],
            _count: {
                id: true,
            },
        });

        const usersWithWallets = await prisma.user.count({
            where: {
                wallet: {
                    isNot: null,
                },
            },
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newUsersToday = await prisma.user.count({
            where: {
                createdAt: { gte: today },
            },
        });

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const newUsersThisWeek = await prisma.user.count({
            where: {
                createdAt: { gte: weekAgo },
            },
        });

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const newUsersThisMonth = await prisma.user.count({
            where: {
                createdAt: { gte: monthStart },
            },
        });

        const activeCustomers = await prisma.user.count({
            where: {
                customerOrders: {
                    some: {},
                },
            },
        });

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
    }

    @Get("/:userId/profile")
    @Authorized(API.Role.admin)
    async getUserProfile(@Param("userId") userId: string) {
        return await this.userService.getUserProfileData(parseInt(userId));
    }

    @Get("/:userId")
    @Authorized(API.Role.admin)
    async getUserDetail(@Param("userId") userId: string) {
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
                ordersAsCustomer: user.customerOrders,
                ordersAsWorker: user.workerOrders,
                customerOrders: undefined,
                workerOrders: undefined,
                password: undefined,
            },
        };
    }

    @Put("/:userId/role")
    @Authorized(API.Role.admin)
    async updateUserRole(
        @Param("userId") userId: string,
        @Body() data: { role: string }
    ) {
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
    }

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
    }

    @Get("/stats/growth")
    @Authorized(API.Role.admin)
    async getUserGrowthStats(@QueryParams() query: { days?: number }) {
        const days = query.days || 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

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
    }

    @Get("/export/csv")
    @Authorized(API.Role.admin)
    async exportUsers(
        @QueryParams()
        query: {
            role?: string;
            search?: string;
        }
    ) {
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

        return {
            success: true,
            data: users.map((user) => ({
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
            })),
        };
    }
}
