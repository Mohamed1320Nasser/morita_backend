import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateWalletDto,
    AddBalanceDto,
    DeductBalanceDto,
    GetWalletListDto,
    GetTransactionHistoryDto,
    UpdateWalletDto,
    WalletType,
    WalletTransactionType,
    WalletTransactionStatus,
    DiscordAddBalanceDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { Decimal } from "@prisma/client/runtime/library";
import logger from "../../common/loggers";
import {
    withTransactionRetry,
    lockWalletForUpdate,
    updateWalletBalance,
} from "../../common/utils/transaction.util";

@Service()
export default class WalletService {
    constructor() {}

    /**
     * Create a new wallet for a user
     */
    async createWallet(data: CreateWalletDto) {
        // Check if user already has a wallet
        const existingWallet = await prisma.wallet.findUnique({
            where: { userId: data.userId },
        });

        if (existingWallet) {
            throw new BadRequestError("User already has a wallet");
        }

        // Verify user exists
        const user = await prisma.user.findUnique({
            where: { id: data.userId },
        });

        if (!user) {
            throw new NotFoundError("User not found");
        }

        const wallet = await prisma.wallet.create({
            data: {
                userId: data.userId,
                walletType: data.walletType || "CUSTOMER",
                currency: data.currency || "USD",
                balance: 0,
                pendingBalance: 0,
                isActive: true,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                        discordDisplayName: true,
                        discordUsername: true,
                    },
                },
            },
        });

        logger.info(`Created wallet for user ${data.userId}`);
        return wallet;
    }

    /**
     * Get or create wallet for a user
     */
    async getOrCreateWallet(userId: number, walletType: WalletType = WalletType.CUSTOMER) {
        let wallet = await prisma.wallet.findUnique({
            where: { userId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                        discordDisplayName: true,
                        discordUsername: true,
                    },
                },
            },
        });

        if (!wallet) {
            wallet = await this.createWallet({
                userId,
                walletType,
            });
        }

        return wallet;
    }

    /**
     * Get wallet by user ID
     */
    async getWalletByUserId(userId: number) {
        const wallet = await prisma.wallet.findUnique({
            where: { userId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                        discordDisplayName: true,
                        discordUsername: true,
                    },
                },
            },
        });

        return wallet;
    }

    /**
     * Get wallet by Discord ID
     */
    async getWalletByDiscordId(discordId: string) {
        logger.info(`[getWalletByDiscordId] Looking up user with discordId: ${discordId}`);

        const user = await prisma.user.findUnique({
            where: { discordId },
        });

        if (!user) {
            logger.warn(`[getWalletByDiscordId] No user found with discordId: ${discordId}`);
            return null;
        }

        logger.info(`[getWalletByDiscordId] User found: ${user.id} (${user.username})`);
        const wallet = await this.getWalletByUserId(user.id);

        if (!wallet) {
            logger.warn(`[getWalletByDiscordId] No wallet found for user ${user.id}`);
        } else {
            logger.info(`[getWalletByDiscordId] Wallet found: ${wallet.id}, balance: ${wallet.balance}`);
        }

        return wallet;
    }

    /**
     * Get or create wallet by Discord ID
     */
    async getOrCreateWalletByDiscordId(
        discordId: string,
        discordUsername: string,
        walletType: WalletType = WalletType.CUSTOMER,
        discordDisplayName?: string
    ) {
        // Find or create user
        let user = await prisma.user.findUnique({
            where: { discordId },
        });

        if (!user) {
            // Create user with Discord ID
            // Use display name for fullname if available, otherwise use username
            const displayName = discordDisplayName || discordUsername;

            user = await prisma.user.create({
                data: {
                    discordId,
                    discordUsername: discordUsername,
                    discordDisplayName: discordDisplayName,
                    fullname: displayName,
                    username: discordUsername,
                    email: `${discordId}@discord.placeholder`,
                    role: "user",
                },
            });
        } else {
            // Update existing user's Discord display name if it changed
            if (discordDisplayName && user.discordDisplayName !== discordDisplayName) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        discordUsername: discordUsername,
                        discordDisplayName: discordDisplayName,
                        fullname: discordDisplayName, // Update fullname too
                    },
                });
                logger.info(`[getOrCreateWalletByDiscordId] Updated display name for user ${user.id}: ${discordDisplayName}`);
            }
        }

        return this.getOrCreateWallet(user.id, walletType);
    }

    /**
     * Get wallet by ID
     */
    async getWalletById(walletId: string) {
        const wallet = await prisma.wallet.findUnique({
            where: { id: walletId },
            include: {
                user: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        email: true,
                        discordId: true,
                        discordDisplayName: true,
                        discordUsername: true,
                    },
                },
            },
        });

        if (!wallet) {
            throw new NotFoundError("Wallet not found");
        }

        return wallet;
    }

    /**
     * Add balance to wallet (deposit)
     */
    async addBalance(
        walletId: string,
        data: AddBalanceDto,
        createdById: number
    ) {
        const amount = new Decimal(data.amount);

        if (amount.lte(0)) {
            throw new BadRequestError("Amount must be greater than zero");
        }

        const isDepositTransaction = data.transactionType === "WORKER_DEPOSIT";

        // The wallet is read under FOR UPDATE inside the transaction so two
        // concurrent credits cannot both compute from the same starting value.
        const result = await withTransactionRetry(async (tx) => {
            const locked = await lockWalletForUpdate(tx, walletId);

            if (!locked.isActive) {
                throw new BadRequestError("Wallet is not active");
            }

            const balanceBefore = new Decimal(locked.balance.toString());
            const depositBefore = new Decimal(locked.deposit.toString());
            const balanceAfter = isDepositTransaction ? balanceBefore : balanceBefore.add(amount);
            const depositAfter = isDepositTransaction ? depositBefore.add(amount) : depositBefore;

            await updateWalletBalance(
                tx,
                walletId,
                isDepositTransaction ? 0 : amount.toNumber(),
                0,
                isDepositTransaction ? amount.toNumber() : 0
            );

            const updatedWallet = await tx.wallet.findUniqueOrThrow({
                where: { id: walletId },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            discordId: true,
                            discordDisplayName: true,
                            discordUsername: true,
                        },
                    },
                },
            });

            // Create transaction record - build data object without undefined values
            const transactionData: any = {
                walletId,
                type: data.transactionType || "DEPOSIT",
                amount,
                balanceBefore,
                balanceAfter,
                currency: data.currency || locked.currency,
                status: "COMPLETED",
                createdById: createdById || 1, // Fallback to admin user ID
            };

            // Add deposit tracking for WORKER_DEPOSIT transactions
            if (isDepositTransaction) {
                transactionData.depositBefore = depositBefore;
                transactionData.depositAfter = depositAfter;
            }

            // Only add optional fields if they have values
            if (data.paymentMethodId) transactionData.paymentMethodId = data.paymentMethodId;
            if (data.reference) transactionData.reference = data.reference;
            if (data.notes) transactionData.notes = data.notes;

            const transaction = await tx.walletTransaction.create({
                data: transactionData,
            });

            return {
                wallet: updatedWallet,
                transaction,
                balanceBefore: balanceBefore.toNumber(),
                balanceAfter: balanceAfter.toNumber(),
                depositBefore: depositBefore.toNumber(),
                depositAfter: depositAfter.toNumber(),
            };
        });

        if (isDepositTransaction) {
            logger.info(
                `Added ${amount} to worker deposit ${walletId}. Deposit: ${result.depositBefore} -> ${result.depositAfter}`
            );
        } else {
            logger.info(
                `Added ${amount} to wallet ${walletId}. Balance: ${result.balanceBefore} -> ${result.balanceAfter}`
            );
        }

        return result;
    }

    /**
     * Add balance via Discord (creates user/wallet if needed)
     */
    async addBalanceByDiscord(data: DiscordAddBalanceDto) {
        // Determine wallet type based on transaction type
        // WORKER_DEPOSIT -> WORKER wallet, otherwise CUSTOMER wallet
        const walletType = data.transactionType === "WORKER_DEPOSIT"
            ? WalletType.WORKER
            : WalletType.CUSTOMER;

        // Get or create wallet with correct type
        const wallet = await this.getOrCreateWalletByDiscordId(
            data.customerDiscordId,
            data.customerDiscordUsername || data.customerDiscordId,
            walletType,
            data.customerDiscordDisplayName
        );

        // Only promote CUSTOMER -> WORKER when collateral is posted. Crediting
        // spendable balance must never demote an existing worker back to
        // CUSTOMER, since the same person can both buy and work.
        if (
            data.transactionType === "WORKER_DEPOSIT" &&
            wallet.walletType !== WalletType.WORKER
        ) {
            await prisma.wallet.update({
                where: { id: wallet.id },
                data: { walletType: WalletType.WORKER },
            });
            logger.info(`[addBalanceByDiscord] Wallet ${wallet.id} type: ${wallet.walletType} -> WORKER (deposit posted)`);
            wallet.walletType = WalletType.WORKER;
        }

        // Add balance
        const result = await this.addBalance(
            wallet.id,
            {
                amount: data.amount,
                transactionType: (data.transactionType === "BALANCE" ? WalletTransactionType.DEPOSIT : data.transactionType as WalletTransactionType) || WalletTransactionType.DEPOSIT,
                paymentMethodId: data.paymentMethodId,
                reference: data.reference,
                notes: data.notes,
            },
            data.createdById
        );

        return result;
    }

    /**
     * Deduct balance from wallet (payment)
     */
    async deductBalance(
        walletId: string,
        data: DeductBalanceDto,
        createdById: number
    ) {
        const amount = new Decimal(data.amount);

        if (amount.lte(0)) {
            throw new BadRequestError("Amount must be greater than zero");
        }

        // Both the sufficiency check and the write happen under the same row
        // lock, so concurrent deductions cannot each pass the check and
        // overdraw the wallet.
        const result = await withTransactionRetry(async (tx) => {
            const locked = await lockWalletForUpdate(tx, walletId);

            if (!locked.isActive) {
                throw new BadRequestError("Wallet is not active");
            }

            const balanceBefore = new Decimal(locked.balance.toString());

            if (balanceBefore.lt(amount)) {
                throw new BadRequestError(
                    `Insufficient balance. Available: ${balanceBefore}, Required: ${amount}`
                );
            }

            const balanceAfter = balanceBefore.sub(amount);

            await updateWalletBalance(
                tx,
                walletId,
                amount.neg().toNumber(),
                data.lockAsPending ? amount.toNumber() : 0
            );

            const updatedWallet = await tx.wallet.findUniqueOrThrow({
                where: { id: walletId },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            discordId: true,
                            discordDisplayName: true,
                            discordUsername: true,
                        },
                    },
                },
            });

            // Create transaction record
            const transaction = await tx.walletTransaction.create({
                data: {
                    walletId,
                    orderId: data.orderId,
                    type: "PAYMENT",
                    amount: amount.neg(), // Negative for deduction
                    balanceBefore,
                    balanceAfter,
                    currency: locked.currency,
                    status: data.lockAsPending ? "PENDING" : "COMPLETED",
                    notes: data.notes,
                    createdById,
                },
            });

            return { wallet: updatedWallet, transaction, balanceAfter: balanceAfter.toNumber() };
        });

        logger.info(
            `Deducted ${amount} from wallet ${walletId}. New balance: ${result.balanceAfter}`
        );

        return result;
    }

    /**
     * Release pending balance (after order completion)
     */
    async releasePendingBalance(
        walletId: string,
        amount: number,
        orderId: string,
        createdById: number
    ) {
        const amountDecimal = new Decimal(amount);

        if (amountDecimal.lte(0)) {
            throw new BadRequestError("Amount must be greater than zero");
        }

        const result = await withTransactionRetry(async (tx) => {
            const locked = await lockWalletForUpdate(tx, walletId);
            const pendingBalance = new Decimal(locked.pendingBalance.toString());

            if (pendingBalance.lt(amountDecimal)) {
                throw new BadRequestError(
                    `Insufficient pending balance. Pending: ${pendingBalance}, Required: ${amountDecimal}`
                );
            }

            await updateWalletBalance(
                tx,
                walletId,
                0,
                amountDecimal.neg().toNumber()
            );

            const updatedWallet = await tx.wallet.findUniqueOrThrow({
                where: { id: walletId },
            });

            const transaction = await tx.walletTransaction.create({
                data: {
                    walletId,
                    orderId,
                    type: "RELEASE",
                    amount: amountDecimal,
                    balanceBefore: locked.balance,
                    balanceAfter: locked.balance,
                    currency: locked.currency,
                    status: "COMPLETED",
                    notes: `Released pending balance for order ${orderId}`,
                    createdById,
                },
            });

            return { wallet: updatedWallet, transaction };
        });

        logger.info(`Released ${amount} pending balance from wallet ${walletId}`);
        return result;
    }

    /**
     * Refund balance to wallet
     */
    async refundBalance(
        walletId: string,
        amount: number,
        orderId: string,
        createdById: number,
        notes?: string
    ) {
        const amountDecimal = new Decimal(amount);

        if (amountDecimal.lte(0)) {
            throw new BadRequestError("Amount must be greater than zero");
        }

        const result = await withTransactionRetry(async (tx) => {
            const locked = await lockWalletForUpdate(tx, walletId);
            const balanceBefore = new Decimal(locked.balance.toString());
            const balanceAfter = balanceBefore.add(amountDecimal);

            await updateWalletBalance(tx, walletId, amountDecimal.toNumber());

            const updatedWallet = await tx.wallet.findUniqueOrThrow({
                where: { id: walletId },
            });

            const transaction = await tx.walletTransaction.create({
                data: {
                    walletId,
                    orderId,
                    type: "REFUND",
                    amount: amountDecimal,
                    balanceBefore,
                    balanceAfter,
                    currency: locked.currency,
                    status: "COMPLETED",
                    notes: notes || `Refund for order ${orderId}`,
                    createdById,
                },
            });

            return { wallet: updatedWallet, transaction };
        });

        logger.info(`Refunded ${amount} to wallet ${walletId}`);
        return result;
    }

    /**
     * Get wallet list (admin)
     */
    async getWalletList(query: GetWalletListDto) {
        const { search, walletType, sortBy = "createdAt", sortOrder = "desc" } = query;
        const page = parseInt(String(query.page)) || 1;
        const limit = parseInt(String(query.limit)) || 20;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (walletType) {
            where.walletType = walletType;
        }

        if (search) {
            where.user = {
                OR: [
                    { fullname: { contains: search } },
                    { username: { contains: search } },
                    { email: { contains: search } },
                    { discordId: { contains: search } },
                ],
            };
        }

        const [wallets, total] = await Promise.all([
            prisma.wallet.findMany({
                where,
                skip,
                take: limit,
                orderBy: { [sortBy]: sortOrder },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            email: true,
                            discordId: true,
                            discordDisplayName: true,
                            discordUsername: true,
                        },
                    },
                },
            }),
            prisma.wallet.count({ where }),
        ]);

        return {
            list: wallets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get transaction history for a wallet
     */
    async getTransactionHistory(walletId: string, query: GetTransactionHistoryDto) {
        const { type, status, sortOrder = "desc" } = query;
        const page = parseInt(String(query.page)) || 1;
        const limit = parseInt(String(query.limit)) || 20;
        const skip = (page - 1) * limit;

        const where: any = { walletId };

        if (type) {
            where.type = type;
        }

        if (status) {
            where.status = status;
        }

        const [transactions, total] = await Promise.all([
            prisma.walletTransaction.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: sortOrder },
                include: {
                    paymentMethod: {
                        select: {
                            id: true,
                            name: true,
                            type: true,
                        },
                    },
                    order: {
                        select: {
                            id: true,
                            status: true,
                        },
                    },
                    createdBy: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                        },
                    },
                },
            }),
            prisma.walletTransaction.count({ where }),
        ]);

        return {
            list: transactions,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Update wallet settings
     */
    async updateWallet(walletId: string, data: UpdateWalletDto) {
        const wallet = await this.getWalletById(walletId);

        const updatedWallet = await prisma.wallet.update({
            where: { id: walletId },
            data: {
                walletType: data.walletType,
                isActive: data.isActive,
                currency: data.currency,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        fullname: true,
                        username: true,
                        discordId: true,
                        discordDisplayName: true,
                        discordUsername: true,
                    },
                },
            },
        });

        logger.info(`Updated wallet ${walletId}`);
        return updatedWallet;
    }


    /**
     * Check if user has sufficient balance
     */
    async hasSufficientBalance(userId: number, amount: number): Promise<boolean> {
        const wallet = await this.getWalletByUserId(userId);
        if (!wallet) return false;

        const balance = new Decimal(wallet.balance.toString());
        return balance.gte(new Decimal(amount));
    }

    /**
     * Get available balance (total - pending)
     */
    async getAvailableBalance(userId: number): Promise<number> {
        const wallet = await this.getWalletByUserId(userId);
        if (!wallet) return 0;

        const balance = new Decimal(wallet.balance.toString());
        return balance.toNumber();
    }

    /**
     * Get wallet statistics for admin dashboard
     */
    async getWalletStats() {
        const [totalWallets, customerWallets, workerWallets, supportWallets, totalBalanceResult, totalPendingResult] = await Promise.all([
            prisma.wallet.count(),
            prisma.wallet.count({ where: { walletType: "CUSTOMER" } }),
            prisma.wallet.count({ where: { walletType: "WORKER" } }),
            prisma.wallet.count({ where: { walletType: "SUPPORT" } }),
            prisma.wallet.aggregate({
                _sum: {
                    balance: true,
                },
            }),
            prisma.wallet.aggregate({
                _sum: {
                    pendingBalance: true,
                },
            }),
        ]);

        const totalBalance = totalBalanceResult._sum.balance
            ? new Decimal(totalBalanceResult._sum.balance.toString()).toNumber()
            : 0;

        const totalPendingBalance = totalPendingResult._sum.pendingBalance
            ? new Decimal(totalPendingResult._sum.pendingBalance.toString()).toNumber()
            : 0;

        return {
            totalWallets,
            customerWallets,
            workerWallets,
            supportWallets,
            totalBalance,
            totalPendingBalance,
        };
    }

    /**
     * Get enhanced wallet statistics for admin dashboard
     */
    async getEnhancedWalletStats() {
        // Get basic stats
        const basicStats = await this.getWalletStats();

        // Get balance by wallet type
        const [customerBalances, workerBalances, supportBalances] = await Promise.all([
            prisma.wallet.aggregate({
                where: { walletType: "CUSTOMER" },
                _sum: { balance: true, pendingBalance: true },
            }),
            prisma.wallet.aggregate({
                where: { walletType: "WORKER" },
                _sum: { balance: true, pendingBalance: true },
            }),
            prisma.wallet.aggregate({
                where: { walletType: "SUPPORT" },
                _sum: { balance: true, pendingBalance: true },
            }),
        ]);

        // Get active vs inactive wallets
        const activeWallets = await prisma.wallet.count({ where: { isActive: true } });
        const inactiveWallets = await prisma.wallet.count({ where: { isActive: false } });

        // Get recent transaction count (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const recentTransactions = await prisma.walletTransaction.count({
            where: {
                createdAt: { gte: weekAgo },
            },
        });

        // Get today's transaction volume
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTransactions = await prisma.walletTransaction.aggregate({
            where: {
                createdAt: { gte: today },
                status: "COMPLETED",
            },
            _sum: { amount: true },
        });

        return {
            ...basicStats,
            customerBalance: customerBalances._sum.balance
                ? new Decimal(customerBalances._sum.balance.toString()).toNumber()
                : 0,
            customerPendingBalance: customerBalances._sum.pendingBalance
                ? new Decimal(customerBalances._sum.pendingBalance.toString()).toNumber()
                : 0,
            workerBalance: workerBalances._sum.balance
                ? new Decimal(workerBalances._sum.balance.toString()).toNumber()
                : 0,
            workerPendingBalance: workerBalances._sum.pendingBalance
                ? new Decimal(workerBalances._sum.pendingBalance.toString()).toNumber()
                : 0,
            supportBalance: supportBalances._sum.balance
                ? new Decimal(supportBalances._sum.balance.toString()).toNumber()
                : 0,
            supportPendingBalance: supportBalances._sum.pendingBalance
                ? new Decimal(supportBalances._sum.pendingBalance.toString()).toNumber()
                : 0,
            activeWallets,
            inactiveWallets,
            recentTransactions,
            todayTransactionVolume: todayTransactions._sum.amount
                ? new Decimal(todayTransactions._sum.amount.toString()).toNumber()
                : 0,
        };
    }

    /**
     * Get system wallet (aggregation of all system payouts)
     */
    async getSystemWallet() {
        // Get system revenue from completed orders
        const systemRevenue = await prisma.order.aggregate({
            where: {
                status: "COMPLETED",
            },
            _sum: {
                systemPayout: true,
            },
        });

        const totalSystemRevenue = systemRevenue._sum.systemPayout
            ? new Decimal(systemRevenue._sum.systemPayout.toString()).toNumber()
            : 0;

        // System payouts are tracked separately if needed
        const totalSystemPayouts = 0;
        const systemBalance = totalSystemRevenue - totalSystemPayouts;

        // Get this month's system revenue
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const monthRevenue = await prisma.order.aggregate({
            where: {
                status: "COMPLETED",
                completedAt: {
                    gte: monthStart,
                },
            },
            _sum: {
                systemPayout: true,
            },
        });

        const thisMonthRevenue = monthRevenue._sum.systemPayout
            ? new Decimal(monthRevenue._sum.systemPayout.toString()).toNumber()
            : 0;

        return {
            systemBalance,
            totalSystemRevenue,
            totalSystemPayouts,
            thisMonthRevenue,
        };
    }

    /**
     * Adjust wallet balance (can be positive or negative)
     */
    async adjustBalance(
        walletId: string,
        data: { amount: number; reference?: string; notes?: string },
        createdById: number
    ) {
        const amount = new Decimal(data.amount);

        if (amount.isZero()) {
            throw new BadRequestError("Adjustment amount cannot be zero");
        }

        // Negative-balance check and write share one row lock, so concurrent
        // adjustments cannot both pass the check and overdraw the wallet.
        const result = await withTransactionRetry(async (tx) => {
            const locked = await lockWalletForUpdate(tx, walletId);

            if (!locked.isActive) {
                throw new BadRequestError("Wallet is not active");
            }

            const balanceBefore = new Decimal(locked.balance.toString());
            const balanceAfter = balanceBefore.add(amount);

            if (balanceAfter.lt(0)) {
                throw new BadRequestError(
                    `Adjustment would result in negative balance. Current: ${balanceBefore}, Adjustment: ${amount}`
                );
            }

            await updateWalletBalance(tx, walletId, amount.toNumber());

            const updatedWallet = await tx.wallet.findUniqueOrThrow({
                where: { id: walletId },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullname: true,
                            username: true,
                            discordId: true,
                        },
                    },
                },
            });

            // Create transaction record
            const transaction = await tx.walletTransaction.create({
                data: {
                    walletId,
                    type: "ADJUSTMENT",
                    amount,
                    balanceBefore,
                    balanceAfter,
                    currency: locked.currency,
                    status: "COMPLETED",
                    reference: data.reference,
                    notes: data.notes || `Manual balance adjustment`,
                    createdById,
                },
            });

            return { wallet: updatedWallet, transaction, balanceAfter: balanceAfter.toNumber() };
        });

        logger.info(
            `Adjusted wallet ${walletId} by ${amount}. New balance: ${result.balanceAfter}`
        );

        return result;
    }
}
