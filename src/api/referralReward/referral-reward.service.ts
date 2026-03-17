import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { UpdateReferralRewardConfigDto } from "./dtos";
import logger from "../../common/loggers";

const DEFAULT_CONFIG_ID = "default-config";

@Service()
export default class ReferralRewardService {
    constructor() {}

    async getConfig() {
        let config = await prisma.referralRewardConfig.findUnique({
            where: { id: DEFAULT_CONFIG_ID },
        });

        if (!config) {
            config = await prisma.referralRewardConfig.create({
                data: {
                    id: DEFAULT_CONFIG_ID,
                    isEnabled: true,
                    rewardMode: 'HYBRID',
                    perReferralEnabled: true,
                    perReferralAmount: 1.00,
                    milestonesEnabled: true,
                    milestones: [
                        { count: 5, reward: 5, type: 'BONUS' },
                        { count: 10, reward: 15, type: 'BONUS' },
                        { count: 25, reward: 50, type: 'BONUS' },
                        { count: 50, reward: 150, type: 'BONUS' },
                        { count: 100, reward: 400, type: 'BONUS' },
                    ],
                    requireOnboarding: true,
                    minimumRetentionRate: 70,
                    minimumDaysInServer: 7,
                    countOnlyActive: true,
                    maxRewardsPerDay: 10,
                    cooldownMinutes: 5,
                    notifyDiscord: true,
                    notifyDM: true,
                    currencyName: "$",
                },
            });
            logger.info("[ReferralReward] Created default configuration");
        }

        return {
            ...config,
            perReferralAmount: Number(config.perReferralAmount),
        };
    }

    async updateConfig(data: UpdateReferralRewardConfigDto) {
        await this.getConfig();

        const config = await prisma.referralRewardConfig.update({
            where: { id: DEFAULT_CONFIG_ID },
            data: {
                ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
                ...(data.rewardMode !== undefined && { rewardMode: data.rewardMode }),
                ...(data.perReferralEnabled !== undefined && { perReferralEnabled: data.perReferralEnabled }),
                ...(data.perReferralAmount !== undefined && { perReferralAmount: data.perReferralAmount }),
                ...(data.milestonesEnabled !== undefined && { milestonesEnabled: data.milestonesEnabled }),
                ...(data.milestones !== undefined && { milestones: data.milestones }),
                ...(data.requireOnboarding !== undefined && { requireOnboarding: data.requireOnboarding }),
                ...(data.minimumRetentionRate !== undefined && { minimumRetentionRate: data.minimumRetentionRate }),
                ...(data.minimumDaysInServer !== undefined && { minimumDaysInServer: data.minimumDaysInServer }),
                ...(data.countOnlyActive !== undefined && { countOnlyActive: data.countOnlyActive }),
                ...(data.maxRewardsPerDay !== undefined && { maxRewardsPerDay: data.maxRewardsPerDay }),
                ...(data.cooldownMinutes !== undefined && { cooldownMinutes: data.cooldownMinutes }),
                ...(data.notifyDiscord !== undefined && { notifyDiscord: data.notifyDiscord }),
                ...(data.notifyDM !== undefined && { notifyDM: data.notifyDM }),
                ...(data.currencyName !== undefined && { currencyName: data.currencyName }),
            },
        });

        logger.info("[ReferralReward] Configuration updated by admin");
        return {
            ...config,
            perReferralAmount: Number(config.perReferralAmount),
        };
    }

    async calculateRewardAmount(referrerId: number): Promise<number> {
        const config = await prisma.referralRewardConfig.findUnique({
            where: { id: DEFAULT_CONFIG_ID },
        });

        if (!config || !config.isEnabled) {
            return 0;
        }

        let rewardAmount = 0;

        const rewardMode = config.rewardMode || 'PER_REFERRAL';

        if (rewardMode === 'PER_REFERRAL' || rewardMode === 'HYBRID') {
            if (config.perReferralEnabled) {
                rewardAmount += Number(config.perReferralAmount);
            }
        }

        if (rewardMode === 'MILESTONE' || rewardMode === 'HYBRID') {
            if (config.milestonesEnabled && config.milestones) {
                const milestoneBonus = await this.checkMilestoneBonus(referrerId, config);
                rewardAmount += milestoneBonus;
            }
        }

        return rewardAmount;
    }

    async checkMilestoneBonus(referrerId: number, config: any): Promise<number> {
        const milestones = config.milestones as Array<{ count: number; reward: number; type: string }>;

        if (!milestones || milestones.length === 0) {
            return 0;
        }

        const countOnlyActive = config.countOnlyActive !== false;

        let activeReferralsCount = 0;

        if (countOnlyActive) {
            activeReferralsCount = await prisma.referral.count({
                where: {
                    referrerId,
                    rewardGiven: true,
                    hasLeftServer: false,
                },
            });
        } else {
            activeReferralsCount = await prisma.referral.count({
                where: {
                    referrerId,
                    rewardGiven: true,
                },
            });
        }

        for (const milestone of milestones.sort((a, b) => a.count - b.count)) {
            if (activeReferralsCount === milestone.count) {
                const alreadyClaimed = await prisma.referralMilestone.findUnique({
                    where: {
                        userId_milestone: {
                            userId: referrerId,
                            milestone: milestone.count,
                        },
                    },
                });

                if (!alreadyClaimed) {
                    await prisma.referralMilestone.create({
                        data: {
                            userId: referrerId,
                            milestone: milestone.count,
                            reward: milestone.reward,
                        },
                    });

                    logger.info(`[ReferralReward] Milestone ${milestone.count} reached! Bonus: $${milestone.reward}`);

                    return milestone.reward;
                }
            }
        }

        return 0;
    }

    async getStats() {
        const [totalRewards, totalRewarded, activeReferrers] = await Promise.all([
            prisma.referral.count({ where: { rewardGiven: true } }),
            prisma.referral.aggregate({
                where: { rewardGiven: true },
                _sum: { rewardAmount: true },
            }),
            prisma.referral.groupBy({
                by: ['referrerId'],
                where: { rewardGiven: true },
                _count: true,
            }),
        ]);

        const config = await this.getConfig();

        return {
            totalRewards,
            totalRewarded: Number(totalRewarded._sum.rewardAmount || 0),
            activeReferrers: activeReferrers.length,
            isEnabled: config.isEnabled,
            currencyName: config.currencyName,
        };
    }

    async getAllRewards(page: number = 1, limit: number = 10, search?: string) {
        const skip = (page - 1) * limit;

        const where: any = {
            rewardGiven: true,
            rewardAmount: { not: null },
        };

        if (search) {
            where.OR = [
                { referrer: { discordUsername: { contains: search } } },
                { referrer: { discordDisplayName: { contains: search } } },
                { referrer: { discordId: { contains: search } } },
                { referredDiscordId: { contains: search } },
            ];
        }

        const [rewards, total] = await Promise.all([
            prisma.referral.findMany({
                where,
                skip,
                take: limit,
                orderBy: { rewardGivenAt: "desc" },
                include: {
                    referrer: {
                        select: {
                            id: true,
                            discordId: true,
                            discordUsername: true,
                            discordDisplayName: true,
                        },
                    },
                    referredUser: {
                        select: {
                            id: true,
                            discordId: true,
                            discordUsername: true,
                            discordDisplayName: true,
                        },
                    },
                },
            }),
            prisma.referral.count({ where }),
        ]);

        return {
            list: rewards.map(r => ({
                ...r,
                rewardAmount: Number(r.rewardAmount || 0),
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getTopReferrers(limit: number = 10) {
        const topReferrers = await prisma.user.findMany({
            where: {
                totalReferrals: { gt: 0 },
            },
            select: {
                id: true,
                discordId: true,
                discordUsername: true,
                discordDisplayName: true,
                totalReferrals: true,
                referralRewards: true,
            },
            orderBy: [
                { totalReferrals: 'desc' },
                { referralRewards: 'desc' },
            ],
            take: limit,
        });

        return topReferrers.map(u => ({
            ...u,
            referralRewards: Number(u.referralRewards || 0),
        }));
    }
}
