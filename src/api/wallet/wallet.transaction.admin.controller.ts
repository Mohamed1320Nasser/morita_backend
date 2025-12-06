import {
    JsonController,
    Get,
    Param,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { GetTransactionHistoryDto } from "./dtos";
import logger from "../../common/loggers";
import { Decimal } from "@prisma/client/runtime/library";
import API from "../../common/config/api.types";

// Admin Transaction Controller (for transaction management in admin panel)
@JsonController("/api/admin/transactions")
@Service()
export default class AdminTransactionController {
    /**
     * Get all transactions with enhanced filters and pagination
     */
    @Get("/")
    @Authorized(API.Role.admin)
    async getAllTransactions(
        @QueryParams() query: GetTransactionHistoryDto & {
            walletId?: string;
            userId?: string;
            type?: string;
            status?: string;
            startDate?: string;
            endDate?: string;
        }
    ) {
        logger.info(`[Admin] Fetching transactions with filters:`, query);

        try {
            const page = parseInt(String(query.page)) || 1;
            const limit = parseInt(String(query.limit)) || 20;
            const skip = (page - 1) * limit;

            // Build filters
            const where: any = {};

            if (query.walletId) {
                where.walletId = query.walletId;
            }

            if (query.type) {
                where.type = query.type;
            }

            if (query.status) {
                where.status = query.status;
            }

            // Search filter (username, email, or reference)
            if (query.search) {
                where.OR = [
                    {
                        wallet: {
                            user: {
                                username: {
                                    contains: query.search,
                                },
                            },
                        },
                    },
                    {
                        wallet: {
                            user: {
                                email: {
                                    contains: query.search,
                                },
                            },
                        },
                    },
                    {
                        reference: {
                            contains: query.search,
                        },
                    },
                ];
            }

            // Date range filter
            if (query.startDate || query.endDate) {
                where.createdAt = {};
                if (query.startDate) {
                    where.createdAt.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    where.createdAt.lte = new Date(query.endDate);
                }
            }

            // User filter (find wallet first)
            if (query.userId) {
                const wallet = await prisma.wallet.findUnique({
                    where: { userId: parseInt(query.userId) },
                });
                if (wallet) {
                    where.walletId = wallet.id;
                }
            }

            // Get transactions
            const [transactions, total] = await Promise.all([
                prisma.walletTransaction.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: "desc",
                    },
                    include: {
                        wallet: {
                            include: {
                                user: {
                                    select: {
                                        id: true,
                                        fullname: true,
                                        username: true,
                                        email: true,
                                        discordId: true,
                                    },
                                },
                            },
                        },
                        createdBy: {
                            select: {
                                id: true,
                                username: true,
                                email: true,
                            },
                        },
                        order: {
                            select: {
                                id: true,
                                orderNumber: true,
                                status: true,
                            },
                        },
                    },
                }),
                prisma.walletTransaction.count({ where }),
            ]);

            return {
                success: true,
                data: {
                    list: transactions.map((tx) => ({
                        id: tx.id,
                        type: tx.type,
                        amount: new Decimal(tx.amount.toString()).toNumber(),
                        balanceBefore: new Decimal(tx.balanceBefore.toString()).toNumber(),
                        balanceAfter: new Decimal(tx.balanceAfter.toString()).toNumber(),
                        currency: tx.currency,
                        status: tx.status,
                        reference: tx.reference,
                        notes: tx.notes,
                        createdAt: tx.createdAt,
                        wallet: {
                            id: tx.wallet.id,
                            walletType: tx.wallet.walletType,
                            user: tx.wallet.user,
                        },
                        createdBy: tx.createdBy,
                        order: tx.order,
                    })),
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get transactions error:`, error);
            throw error;
        }
    }

    /**
     * Get transaction statistics
     */
    @Get("/stats")
    @Authorized(API.Role.admin)
    async getTransactionStats() {
        logger.info(`[Admin] Fetching transaction statistics`);

        try {
            // Get total transactions count
            const totalTransactions = await prisma.walletTransaction.count();

            // Get transactions by type
            const transactionsByType = await prisma.walletTransaction.groupBy({
                by: ["type"],
                _count: {
                    id: true,
                },
                _sum: {
                    amount: true,
                },
            });

            // Get transactions by status
            const transactionsByStatus = await prisma.walletTransaction.groupBy({
                by: ["status"],
                _count: {
                    id: true,
                },
            });

            // Get today's transactions
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTransactions = await prisma.walletTransaction.count({
                where: {
                    createdAt: { gte: today },
                },
            });

            // Get this week's transactions
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const weekTransactions = await prisma.walletTransaction.count({
                where: {
                    createdAt: { gte: weekAgo },
                },
            });

            // Get this month's transactions
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            const monthTransactions = await prisma.walletTransaction.count({
                where: {
                    createdAt: { gte: monthStart },
                },
            });

            // Get total volume (deposits)
            const depositVolume = await prisma.walletTransaction.aggregate({
                where: {
                    type: "DEPOSIT",
                    status: "COMPLETED",
                },
                _sum: {
                    amount: true,
                },
            });

            // Get total withdrawals
            const withdrawalVolume = await prisma.walletTransaction.aggregate({
                where: {
                    type: "WITHDRAWAL",
                    status: "COMPLETED",
                },
                _sum: {
                    amount: true,
                },
            });

            // Get pending transactions count
            const pendingTransactions = await prisma.walletTransaction.count({
                where: {
                    status: "PENDING",
                },
            });

            return {
                success: true,
                data: {
                    totalTransactions,
                    transactionsByType: transactionsByType.map((item) => ({
                        type: item.type,
                        count: item._count.id,
                        totalAmount: item._sum.amount
                            ? new Decimal(item._sum.amount.toString()).toNumber()
                            : 0,
                    })),
                    transactionsByStatus: transactionsByStatus.map((item) => ({
                        status: item.status,
                        count: item._count.id,
                    })),
                    todayTransactions,
                    weekTransactions,
                    monthTransactions,
                    totalDepositVolume: depositVolume._sum.amount
                        ? new Decimal(depositVolume._sum.amount.toString()).toNumber()
                        : 0,
                    totalWithdrawalVolume: withdrawalVolume._sum.amount
                        ? Math.abs(
                              new Decimal(withdrawalVolume._sum.amount.toString()).toNumber()
                          )
                        : 0,
                    pendingTransactions,
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get transaction stats error:`, error);
            throw error;
        }
    }

    /**
     * Get transaction volume chart data (last 30 days)
     */
    @Get("/stats/volume")
    @Authorized(API.Role.admin)
    async getTransactionVolumeStats(@QueryParams() query: { days?: number }) {
        const days = query.days || 30;
        logger.info(`[Admin] Fetching transaction volume for last ${days} days`);

        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);

            // Get transactions grouped by date
            const transactions = await prisma.walletTransaction.findMany({
                where: {
                    createdAt: {
                        gte: startDate,
                    },
                    status: "COMPLETED",
                },
                select: {
                    createdAt: true,
                    amount: true,
                    type: true,
                },
                orderBy: {
                    createdAt: "asc",
                },
            });

            // Group by date
            const volumeByDate = new Map<
                string,
                { deposits: number; withdrawals: number; count: number }
            >();

            transactions.forEach((tx) => {
                const dateKey = tx.createdAt.toISOString().split("T")[0];
                const existing = volumeByDate.get(dateKey) || {
                    deposits: 0,
                    withdrawals: 0,
                    count: 0,
                };

                const amount = new Decimal(tx.amount.toString()).toNumber();

                if (tx.type === "DEPOSIT") {
                    existing.deposits += amount;
                } else if (tx.type === "WITHDRAWAL") {
                    existing.withdrawals += Math.abs(amount);
                }

                existing.count += 1;

                volumeByDate.set(dateKey, existing);
            });

            // Convert to array and fill missing dates
            const result = [];
            for (let i = 0; i < days; i++) {
                const date = new Date();
                date.setDate(date.getDate() - (days - 1 - i));
                const dateKey = date.toISOString().split("T")[0];
                const data = volumeByDate.get(dateKey) || {
                    deposits: 0,
                    withdrawals: 0,
                    count: 0,
                };
                result.push({
                    date: dateKey,
                    deposits: data.deposits,
                    withdrawals: data.withdrawals,
                    count: data.count,
                });
            }

            return {
                success: true,
                data: result,
            };
        } catch (error) {
            logger.error(`[Admin] Get transaction volume stats error:`, error);
            throw error;
        }
    }

    /**
     * Get transaction detail by ID
     */
    @Get("/:transactionId")
    @Authorized(API.Role.admin)
    async getTransactionDetail(@Param("transactionId") transactionId: string) {
        logger.info(`[Admin] Fetching transaction ${transactionId}`);

        try {
            const transaction = await prisma.walletTransaction.findUnique({
                where: { id: transactionId },
                include: {
                    wallet: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    username: true,
                                    email: true,
                                    discordId: true,
                                },
                            },
                        },
                    },
                    createdBy: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                            orderNumber: true,
                            status: true,
                            customer: {
                                select: {
                                    username: true,
                                },
                            },
                            worker: {
                                select: {
                                    username: true,
                                },
                            },
                        },
                    },
                    paymentMethod: true,
                },
            });

            if (!transaction) {
                throw new Error("Transaction not found");
            }

            return {
                success: true,
                data: {
                    ...transaction,
                    amount: new Decimal(transaction.amount.toString()).toNumber(),
                    balanceBefore: new Decimal(transaction.balanceBefore.toString()).toNumber(),
                    balanceAfter: new Decimal(transaction.balanceAfter.toString()).toNumber(),
                },
            };
        } catch (error) {
            logger.error(`[Admin] Get transaction detail error:`, error);
            throw error;
        }
    }

    /**
     * Export transactions to CSV (returns data for CSV generation on frontend)
     */
    @Get("/export/csv")
    @Authorized(["admin"])
    async exportTransactions(
        @QueryParams()
        query: GetTransactionHistoryDto & {
            walletId?: string;
            type?: string;
            status?: string;
            startDate?: string;
            endDate?: string;
        }
    ) {
        logger.info(`[Admin] Exporting transactions to CSV`);

        try {
            // Build filters (same as getAllTransactions but no pagination)
            const where: any = {};

            if (query.walletId) {
                where.walletId = query.walletId;
            }

            if (query.type) {
                where.type = query.type;
            }

            if (query.status) {
                where.status = query.status;
            }

            // Search filter (username, email, or reference)
            if (query.search) {
                where.OR = [
                    {
                        wallet: {
                            user: {
                                username: {
                                    contains: query.search,
                                },
                            },
                        },
                    },
                    {
                        wallet: {
                            user: {
                                email: {
                                    contains: query.search,
                                },
                            },
                        },
                    },
                    {
                        reference: {
                            contains: query.search,
                        },
                    },
                ];
            }

            if (query.startDate || query.endDate) {
                where.createdAt = {};
                if (query.startDate) {
                    where.createdAt.gte = new Date(query.startDate);
                }
                if (query.endDate) {
                    where.createdAt.lte = new Date(query.endDate);
                }
            }

            const transactions = await prisma.walletTransaction.findMany({
                where,
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    wallet: {
                        include: {
                            user: {
                                select: {
                                    username: true,
                                    email: true,
                                },
                            },
                        },
                    },
                    order: {
                        select: {
                            orderNumber: true,
                        },
                    },
                },
            });

            // Format for CSV export
            const csvData = transactions.map((tx) => ({
                id: tx.id,
                type: tx.type,
                amount: new Decimal(tx.amount.toString()).toNumber(),
                currency: tx.currency,
                status: tx.status,
                username: tx.wallet.user?.username || "N/A",
                walletType: tx.wallet.walletType,
                orderNumber: tx.order?.orderNumber || "N/A",
                reference: tx.reference || "",
                notes: tx.notes || "",
                createdAt: tx.createdAt,
            }));

            return {
                success: true,
                data: csvData,
            };
        } catch (error) {
            logger.error(`[Admin] Export transactions error:`, error);
            throw error;
        }
    }
}
