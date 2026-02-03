import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { UpdateOrderRewardConfigDto } from "./dtos";
import { BadRequestError } from "routing-controllers";
import logger from "../../common/loggers";
import { Decimal } from "@prisma/client/runtime/library";

const DEFAULT_CONFIG_ID = "default-config";

@Service()
export default class OrderRewardService {
    constructor() {}

    async getConfig() {
        let config = await prisma.orderRewardConfig.findUnique({
            where: { id: DEFAULT_CONFIG_ID },
        });

        if (!config) {
            config = await prisma.orderRewardConfig.create({
                data: {
                    id: DEFAULT_CONFIG_ID,
                    isEnabled: false,
                    rewardType: "PERCENTAGE",
                    fixedAmount: 5,
                    percentage: 2,
                    minReward: 1,
                    maxReward: 50,
                    minOrderAmount: 20,
                    firstOrderBonus: 0,
                    notifyDiscord: true,
                    currencyName: "$",
                },
            });
            logger.info("[OrderReward] Created default configuration");
        }

        return {
            ...config,
            fixedAmount: Number(config.fixedAmount),
            percentage: Number(config.percentage),
            minReward: Number(config.minReward),
            maxReward: Number(config.maxReward),
            minOrderAmount: Number(config.minOrderAmount),
            firstOrderBonus: Number(config.firstOrderBonus),
        };
    }

    async updateConfig(data: UpdateOrderRewardConfigDto) {
        await this.getConfig(); // Ensure config exists

        const config = await prisma.orderRewardConfig.update({
            where: { id: DEFAULT_CONFIG_ID },
            data: {
                ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
                ...(data.rewardType !== undefined && { rewardType: data.rewardType }),
                ...(data.fixedAmount !== undefined && { fixedAmount: data.fixedAmount }),
                ...(data.percentage !== undefined && { percentage: data.percentage }),
                ...(data.minReward !== undefined && { minReward: data.minReward }),
                ...(data.maxReward !== undefined && { maxReward: data.maxReward }),
                ...(data.minOrderAmount !== undefined && { minOrderAmount: data.minOrderAmount }),
                ...(data.firstOrderBonus !== undefined && { firstOrderBonus: data.firstOrderBonus }),
                ...(data.notifyDiscord !== undefined && { notifyDiscord: data.notifyDiscord }),
                ...(data.currencyName !== undefined && { currencyName: data.currencyName }),
            },
        });

        logger.info("[OrderReward] Configuration updated");
        return {
            ...config,
            fixedAmount: Number(config.fixedAmount),
            percentage: Number(config.percentage),
            minReward: Number(config.minReward),
            maxReward: Number(config.maxReward),
            minOrderAmount: Number(config.minOrderAmount),
            firstOrderBonus: Number(config.firstOrderBonus),
        };
    }

    async processOrderReward(orderId: string, customerId: number, orderValue: number): Promise<{
        success: boolean;
        rewardAmount?: number;
        isFirstOrder?: boolean;
        error?: string;
    }> {
        const config = await this.getConfig();

        if (!config.isEnabled) {
            return { success: false, error: "Order rewards are disabled" };
        }

        const existingClaim = await prisma.orderRewardClaim.findUnique({
            where: { orderId },
        });

        if (existingClaim) {
            return { success: false, error: "Reward already claimed for this order" };
        }
        if (orderValue < config.minOrderAmount) {
            return { success: false, error: `Order value below minimum (${config.currencyName}${config.minOrderAmount})` };
        }

        const completedOrdersCount = await prisma.order.count({
            where: {
                customerId,
                status: "COMPLETED",
                id: { not: orderId },
            },
        });
        const isFirstOrder = completedOrdersCount === 0;

        let rewardAmount = 0;

        if (config.rewardType === "FIXED") {
            rewardAmount = config.fixedAmount;
        } else {
            rewardAmount = orderValue * (config.percentage / 100);
            rewardAmount = Math.max(rewardAmount, config.minReward);
            rewardAmount = Math.min(rewardAmount, config.maxReward);
        }

        // Add first order bonus
        if (isFirstOrder && config.firstOrderBonus > 0) {
            rewardAmount += config.firstOrderBonus;
        }

        // Round to 2 decimal places
        rewardAmount = Math.round(rewardAmount * 100) / 100;

        // Process reward in transaction
        await prisma.$transaction(async (tx) => {
            // Create claim record
            await tx.orderRewardClaim.create({
                data: {
                    orderId,
                    userId: customerId,
                    orderAmount: orderValue,
                    rewardAmount,
                    isFirstOrder,
                },
            });

            // Get or create wallet
            let wallet = await tx.wallet.findUnique({
                where: { userId: customerId },
            });

            if (!wallet) {
                wallet = await tx.wallet.create({
                    data: {
                        userId: customerId,
                        walletType: "CUSTOMER",
                        balance: 0,
                        pendingBalance: 0,
                        currency: "USD",
                    },
                });
            }

            const newBalance = new Decimal(wallet.balance).plus(rewardAmount);

            // Update wallet
            await tx.wallet.update({
                where: { id: wallet.id },
                data: { balance: newBalance },
            });

            // Create transaction record
            await tx.walletTransaction.create({
                data: {
                    walletId: wallet.id,
                    type: "ORDER_REWARD",
                    amount: new Decimal(rewardAmount),
                    balanceBefore: wallet.balance,
                    balanceAfter: newBalance,
                    status: "COMPLETED",
                    orderId,
                    reference: `order-reward-${orderId}`,
                    notes: `Order completion reward${isFirstOrder ? " (First order bonus included)" : ""}`,
                    createdById: customerId,
                },
            });
        });

        logger.info(`[OrderReward] Customer ${customerId} received ${config.currencyName}${rewardAmount} for order ${orderId}${isFirstOrder ? " (first order)" : ""}`);

        return {
            success: true,
            rewardAmount,
            isFirstOrder,
        };
    }

    async getAllClaims(page: number = 1, limit: number = 10, search?: string) {
        const skip = (page - 1) * limit;

        const where: any = {};

        if (search) {
            where.OR = [
                { user: { discordUsername: { contains: search } } },
                { user: { discordDisplayName: { contains: search } } },
                { user: { discordId: { contains: search } } },
                { orderId: { contains: search } },
            ];
        }

        const [claims, total] = await Promise.all([
            prisma.orderRewardClaim.findMany({
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
                    order: {
                        select: {
                            orderNumber: true,
                            orderValue: true,
                        },
                    },
                },
            }),
            prisma.orderRewardClaim.count({ where }),
        ]);

        return {
            list: claims.map(c => ({
                ...c,
                orderAmount: Number(c.orderAmount),
                rewardAmount: Number(c.rewardAmount),
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getStats() {
        const [totalClaims, totalRewarded, firstOrderClaims] = await Promise.all([
            prisma.orderRewardClaim.count(),
            prisma.orderRewardClaim.aggregate({
                _sum: { rewardAmount: true },
            }),
            prisma.orderRewardClaim.count({ where: { isFirstOrder: true } }),
        ]);

        return {
            totalClaims,
            totalRewarded: Number(totalRewarded._sum.rewardAmount || 0),
            firstOrderClaims,
        };
    }

    async getRewardByOrderId(orderId: string) {
        const claim = await prisma.orderRewardClaim.findUnique({
            where: { orderId },
        });

        if (!claim) {
            return null;
        }

        const config = await this.getConfig();

        return {
            rewardAmount: Number(claim.rewardAmount),
            isFirstOrder: claim.isFirstOrder,
            currencyName: config.currencyName,
            claimedAt: claim.claimedAt,
        };
    }
}
