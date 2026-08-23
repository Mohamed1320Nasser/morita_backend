import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { UpdateConfigDto, ClaimStatus, ClaimResult } from "./dtos";
import { BadRequestError } from "routing-controllers";
import logger from "../../common/loggers";
import { Decimal } from "@prisma/client/runtime/library";

const DEFAULT_CONFIG_ID = "default-config";

@Service()
export default class DailyRewardService {
    constructor() {}

    async getConfig() {
        let config = await prisma.dailyRewardConfig.findUnique({
            where: { id: DEFAULT_CONFIG_ID },
        });

        if (!config) {
            config = await prisma.dailyRewardConfig.create({
                data: {
                    id: DEFAULT_CONFIG_ID,
                    minAmount: 1,
                    maxAmount: 5,
                    cooldownHours: 24,
                    isEnabled: true,
                    currencyName: "$",
                    currencyEmoji: "💵",
                    gifUrl: "https://tenor.com/0Orl.gif",
                },
            });
            logger.info("[DailyReward] Created default configuration");
        }

        return config;
    }

    async getPublicConfig() {
        const config = await this.getConfig();
        return {
            isEnabled: config.isEnabled,
            currencyName: config.currencyName,
            currencyEmoji: config.currencyEmoji,
            cooldownHours: config.cooldownHours,
            gifUrl: config.gifUrl,
            thumbnailUrl: config.thumbnailUrl,
        };
    }

    async updateConfig(data: UpdateConfigDto) {
        const currentConfig = await this.getConfig();

        const effectiveMin =
            data.minAmount !== undefined
                ? new Decimal(data.minAmount)
                : new Decimal(currentConfig.minAmount.toString());
        const effectiveMax =
            data.maxAmount !== undefined
                ? new Decimal(data.maxAmount)
                : new Decimal(currentConfig.maxAmount.toString());

        if (effectiveMin.greaterThan(effectiveMax)) {
            throw new BadRequestError(
                `minAmount ($${effectiveMin.toFixed(2)}) cannot be greater than maxAmount ($${effectiveMax.toFixed(2)})`
            );
        }

        const config = await prisma.dailyRewardConfig.update({
            where: { id: DEFAULT_CONFIG_ID },
            data: {
                ...(data.minAmount !== undefined && { minAmount: data.minAmount }),
                ...(data.maxAmount !== undefined && { maxAmount: data.maxAmount }),
                ...(data.cooldownHours !== undefined && { cooldownHours: data.cooldownHours }),
                ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
                ...(data.currencyName !== undefined && { currencyName: data.currencyName }),
                ...(data.currencyEmoji !== undefined && { currencyEmoji: data.currencyEmoji }),
                ...(data.gifUrl !== undefined && { gifUrl: data.gifUrl }),
                ...(data.thumbnailUrl !== undefined && { thumbnailUrl: data.thumbnailUrl }),
                ...(data.reminderEnabled !== undefined && {
                    reminderEnabled: data.reminderEnabled,
                }),
                ...(data.reminderAfterHours !== undefined && {
                    reminderAfterHours: data.reminderAfterHours,
                }),
                ...(data.reminderChannelId !== undefined && {
                    reminderChannelId: data.reminderChannelId || null,
                }),
            },
        });

        logger.info("[DailyReward] Configuration updated");
        return config;
    }

    /**
     * Members due a nudge about the daily reward: joined at least
     * reminderAfterHours ago, never claimed, and not already reminded.
     */
    async getPendingReminders() {
        const config = await this.getConfig();

        if (!config.isEnabled || !config.reminderEnabled) {
            return { enabled: false, channelId: null, users: [] };
        }

        const cutoff = new Date(Date.now() - config.reminderAfterHours * 60 * 60 * 1000);

        const users = await prisma.user.findMany({
            where: {
                discordId: { not: null },
                deletedAt: null,
                createdAt: { lte: cutoff },
                dailyRewardRemindedAt: null,
                dailyRewardClaims: { none: {} },
            },
            select: { id: true, discordId: true, discordUsername: true },
            take: 50,
        });

        return {
            enabled: true,
            channelId: config.reminderChannelId || null,
            currencyName: config.currencyName,
            currencyEmoji: config.currencyEmoji,
            users,
        };
    }

    async markReminded(discordIds: string[]) {
        if (discordIds.length === 0) {
            return { updated: 0 };
        }

        const result = await prisma.user.updateMany({
            where: { discordId: { in: discordIds } },
            data: { dailyRewardRemindedAt: new Date() },
        });

        return { updated: result.count };
    }

    async getClaimStatus(discordId: string): Promise<ClaimStatus> {
        const config = await this.getConfig();

        const user = await prisma.user.findFirst({
            where: { discordId },
        });

        if (!user) {
            return {
                canClaim: false,
                nextClaimAt: null,
                remainingSeconds: null,
                lastClaimAmount: null,
                totalClaimed: 0,
                claimCount: 0,
            };
        }

        const [lastClaim, stats] = await Promise.all([
            prisma.dailyRewardClaim.findFirst({
                where: { userId: user.id },
                orderBy: { claimedAt: "desc" },
            }),
            prisma.dailyRewardClaim.aggregate({
                where: { userId: user.id },
                _sum: { amount: true },
                _count: { id: true },
            }),
        ]);

        const now = new Date();
        let canClaim = config.isEnabled;
        let nextClaimAt: Date | null = null;
        let remainingSeconds: number | null = null;

        if (lastClaim) {
            const cooldownMs = config.cooldownHours * 60 * 60 * 1000;
            nextClaimAt = new Date(lastClaim.claimedAt.getTime() + cooldownMs);

            if (now < nextClaimAt) {
                canClaim = false;
                remainingSeconds = Math.ceil((nextClaimAt.getTime() - now.getTime()) / 1000);
            }
        }

        return {
            canClaim,
            nextClaimAt,
            remainingSeconds,
            lastClaimAmount:
                lastClaim?.amount !== undefined && lastClaim?.amount !== null
                    ? Number(lastClaim.amount)
                    : null,
            totalClaimed: stats._sum.amount ? Number(stats._sum.amount) : 0,
            claimCount: stats._count.id || 0,
        };
    }

    async claimReward(discordId: string): Promise<ClaimResult> {
        const config = await this.getConfig();

        if (!config.isEnabled) {
            return { success: false, error: "Daily rewards are currently disabled" };
        }

        const user = await prisma.user.findFirst({
            where: { discordId },
        });

        if (!user) {
            return { success: false, error: "User not found. Please complete onboarding first." };
        }

        const status = await this.getClaimStatus(discordId);
        if (!status.canClaim) {
            return {
                success: false,
                error: "You have already claimed your daily reward",
                nextClaimAt: status.nextClaimAt || undefined,
            };
        }

        const amount = this.generateRandomAmount(
            Number(config.minAmount),
            Number(config.maxAmount)
        );

        const result = await prisma.$transaction(async (tx) => {
            const claim = await tx.dailyRewardClaim.create({
                data: { userId: user.id, amount },
            });

            let wallet = await tx.wallet.findUnique({
                where: { userId: user.id },
            });

            if (!wallet) {
                wallet = await tx.wallet.create({
                    data: {
                        userId: user.id,
                        walletType: "CUSTOMER",
                        balance: 0,
                        pendingBalance: 0,
                        currency: "USD",
                    },
                });
            }

            const newBalance = new Decimal(wallet.balance).plus(amount);

            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance },
            });

            await tx.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    type: "DAILY_REWARD",
                    amount: new Decimal(amount),
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    status: "COMPLETED",
                    reference: `daily-reward-${claim.id}`,
                    notes: `Daily reward claim: ${amount} ${config.currencyName}`,
                    createdById: user.id,
                },
            });

            return { claim, newBalance: newBalance.toNumber() };
        });

        const nextClaimAt = new Date(
            result.claim.claimedAt.getTime() + config.cooldownHours * 60 * 60 * 1000
        );

        logger.info(
            `[DailyReward] User ${discordId} claimed ${amount} ${config.currencyName}. New balance: ${result.newBalance}`
        );

        return {
            success: true,
            amount,
            newBalance: result.newBalance,
            nextClaimAt,
        };
    }


    async getClaimHistory(discordId: string, limit: number = 10) {
        const user = await prisma.user.findFirst({
            where: { discordId },
        });

        if (!user) {
            return [];
        }

        return prisma.dailyRewardClaim.findMany({
            where: { userId: user.id },
            orderBy: { claimedAt: "desc" },
            take: limit,
        });
    }

    async getAllClaims(page: number = 1, limit: number = 10, search?: string) {
        const skip = (page - 1) * limit;

        const where: any = {};

        if (search) {
            where.user = {
                OR: [
                    { discordUsername: { contains: search } },
                    { discordDisplayName: { contains: search } },
                    { discordId: { contains: search } },
                ],
            };
        }

        const [claims, total] = await Promise.all([
            prisma.dailyRewardClaim.findMany({
                where,
                skip,
                take: limit,
                orderBy: { claimedAt: "desc" },
                include: {
                    user: {
                        select: {
                            id: true,
                            discordId: true,
                            discordUsername: true,
                            discordDisplayName: true,
                        },
                    },
                },
            }),
            prisma.dailyRewardClaim.count({ where }),
        ]);

        return {
            list: claims,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getLeaderboard(limit: number = 10) {
        const leaderboard = await prisma.dailyRewardClaim.groupBy({
            by: ["userId"],
            _sum: { amount: true },
            _count: { id: true },
            orderBy: { _sum: { amount: "desc" } },
            take: limit,
        });

        const userIds = leaderboard.map((l) => l.userId);
        const users = await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: {
                id: true,
                discordId: true,
                discordUsername: true,
                discordDisplayName: true,
            },
        });

        const userMap = new Map(users.map((u) => [u.id, u]));

        return leaderboard.map((entry, index) => ({
            rank: index + 1,
            user: userMap.get(entry.userId),
            totalClaimed: entry._sum.amount ? Number(entry._sum.amount) : 0,
            claimCount: entry._count.id,
        }));
    }

    private generateRandomAmount(min: number, max: number): number {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        const value = low + Math.random() * (high - low);
        return Math.round(value * 100) / 100;
    }
}
