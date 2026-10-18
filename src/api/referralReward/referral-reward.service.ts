import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { UpdateReferralRewardConfigDto } from "./dtos";
import logger from "../../common/loggers";
import { BadRequestError } from "routing-controllers";

const DEFAULT_CONFIG_ID = "default-config";

export interface ReferralMilestoneConfig {
    count: number;
    reward: number;
    type: string;
}

type MilestoneState = {
    rewardMode: string;
    milestonesEnabled: boolean;
    countOnlyActive: boolean;
    milestones: ReferralMilestoneConfig[];
};

const DEFAULT_MILESTONES: ReferralMilestoneConfig[] = [
    { count: 5, reward: 5, type: 'BONUS' },
    { count: 10, reward: 15, type: 'BONUS' },
    { count: 25, reward: 50, type: 'BONUS' },
    { count: 50, reward: 150, type: 'BONUS' },
    { count: 100, reward: 400, type: 'BONUS' },
];

/** Decimal columns as plain numbers, milestones normalised. */
function serialiseConfig<T extends {
    perReferralAmount: unknown;
    milestones: unknown;
    orderRewardValue: unknown;
    orderRewardMaxPerOrder: unknown;
    orderRewardMinOrderValue: unknown;
    orderRewardLifetimeCap: unknown;
}>(config: T) {
    return {
        ...config,
        perReferralAmount: Number(config.perReferralAmount),
        milestones: normaliseMilestones(config.milestones),
        orderRewardValue: Number(config.orderRewardValue),
        orderRewardMaxPerOrder: Number(config.orderRewardMaxPerOrder),
        orderRewardMinOrderValue: Number(config.orderRewardMinOrderValue),
        orderRewardLifetimeCap: Number(config.orderRewardLifetimeCap),
    };
}

/**
 * Milestones are stored as free-form JSON, so coerce whatever is there into
 * sorted, numeric BONUS entries and drop anything unusable.
 */
export function normaliseMilestones(raw: unknown): ReferralMilestoneConfig[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((m: any) => ({
            count: Math.floor(Number(m?.count)),
            reward: Number(m?.reward),
            type: 'BONUS',
        }))
        .filter(m => Number.isFinite(m.count) && m.count >= 1 && Number.isFinite(m.reward) && m.reward >= 0)
        .sort((a, b) => a.count - b.count);
}

@Service()
export default class ReferralRewardService {
    constructor() {}

    async getConfig() {
        // upsert so two first-time callers cannot race into a duplicate-key error
        const config = await prisma.referralRewardConfig.upsert({
            where: { id: DEFAULT_CONFIG_ID },
            update: {},
            create: {
                id: DEFAULT_CONFIG_ID,
                isEnabled: true,
                rewardMode: 'HYBRID',
                perReferralEnabled: true,
                perReferralAmount: 1.00,
                milestonesEnabled: true,
                milestones: DEFAULT_MILESTONES,
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

        return serialiseConfig(config);
    }

    async updateConfig(data: UpdateReferralRewardConfigDto) {
        const before = await this.getConfig();

        let milestones: ReferralMilestoneConfig[] | undefined;
        if (data.milestones !== undefined) {
            milestones = normaliseMilestones(data.milestones);
            const counts = milestones.map(m => m.count);
            if (new Set(counts).size !== counts.length) {
                throw new BadRequestError("Each milestone must have a different referral count");
            }
        }

        // The mode decides which reward parts are on; the two flags just mirror it.
        // Independent flags allowed e.g. PER_REFERRAL with per-referral off,
        // which counted referrals but never paid anything.
        const rewardMode = data.rewardMode ?? before.rewardMode;
        const perReferralEnabled = rewardMode === 'PER_REFERRAL' || rewardMode === 'HYBRID';
        const milestonesEnabled = rewardMode === 'MILESTONE' || rewardMode === 'HYBRID';

        const perReferralAmount = data.perReferralAmount ?? before.perReferralAmount;
        const finalMilestones = milestones ?? before.milestones;
        const paysPerReferral = perReferralEnabled && perReferralAmount > 0;
        const paysMilestones = milestonesEnabled && finalMilestones.some(m => m.reward > 0);

        const orderRewardEnabled = data.orderRewardEnabled ?? before.orderRewardEnabled;
        const orderRewardType = data.orderRewardType ?? before.orderRewardType;
        const orderRewardValue = data.orderRewardValue ?? before.orderRewardValue;
        const paysOrders = orderRewardEnabled && orderRewardValue > 0;

        if (milestonesEnabled && finalMilestones.length === 0) {
            throw new BadRequestError("Add at least one milestone for this reward mode");
        }
        if (rewardMode === 'PER_REFERRAL' && !paysPerReferral && !paysOrders) {
            throw new BadRequestError("Per-referral mode needs a reward amount greater than 0");
        }
        if (!paysPerReferral && !paysMilestones && !paysOrders) {
            throw new BadRequestError("This configuration would never pay anything; set an amount, a milestone bonus or an order reward");
        }
        if (orderRewardEnabled && !(orderRewardValue > 0)) {
            throw new BadRequestError("Order reward needs a value greater than 0");
        }
        if (orderRewardEnabled && orderRewardType === 'PERCENTAGE' && orderRewardValue > 100) {
            throw new BadRequestError("Order reward percentage cannot be more than 100%");
        }

        const config = await prisma.referralRewardConfig.update({
            where: { id: DEFAULT_CONFIG_ID },
            data: {
                ...(data.isEnabled !== undefined && { isEnabled: data.isEnabled }),
                rewardMode,
                perReferralEnabled,
                milestonesEnabled,
                ...(data.perReferralAmount !== undefined && { perReferralAmount: data.perReferralAmount }),
                ...(milestones !== undefined && { milestones }),
                ...(data.requireOnboarding !== undefined && { requireOnboarding: data.requireOnboarding }),
                ...(data.minimumRetentionRate !== undefined && { minimumRetentionRate: data.minimumRetentionRate }),
                ...(data.minimumDaysInServer !== undefined && { minimumDaysInServer: data.minimumDaysInServer }),
                ...(data.countOnlyActive !== undefined && { countOnlyActive: data.countOnlyActive }),
                ...(data.maxRewardsPerDay !== undefined && { maxRewardsPerDay: data.maxRewardsPerDay }),
                ...(data.cooldownMinutes !== undefined && { cooldownMinutes: data.cooldownMinutes }),
                ...(data.notifyDiscord !== undefined && { notifyDiscord: data.notifyDiscord }),
                ...(data.notifyDM !== undefined && { notifyDM: data.notifyDM }),
                ...(data.currencyName !== undefined && { currencyName: data.currencyName.trim() || "$" }),
                ...(data.orderRewardEnabled !== undefined && { orderRewardEnabled: data.orderRewardEnabled }),
                ...(data.orderRewardType !== undefined && { orderRewardType: data.orderRewardType }),
                ...(data.orderRewardValue !== undefined && { orderRewardValue: data.orderRewardValue }),
                ...(data.orderRewardMaxPerOrder !== undefined && { orderRewardMaxPerOrder: data.orderRewardMaxPerOrder }),
                ...(data.orderRewardMinOrderValue !== undefined && { orderRewardMinOrderValue: data.orderRewardMinOrderValue }),
                ...(data.orderRewardOrderCount !== undefined && { orderRewardOrderCount: data.orderRewardOrderCount }),
                ...(data.orderRewardWindowDays !== undefined && { orderRewardWindowDays: data.orderRewardWindowDays }),
                ...(data.orderRewardHoldDays !== undefined && { orderRewardHoldDays: data.orderRewardHoldDays }),
                ...(data.orderRewardLifetimeCap !== undefined && { orderRewardLifetimeCap: data.orderRewardLifetimeCap }),
            },
        });

        const after = serialiseConfig(config);

        await this.grandfatherNewMilestones(before, after);

        logger.info(
            `[ReferralReward] Configuration updated by admin (enabled=${after.isEnabled}, mode=${after.rewardMode})`
        );
        return after;
    }

    /**
     * Milestones pay only for progress made while they are active. When a
     * milestone becomes active (mode switched to MILESTONE/HYBRID, or a new
     * count added), referrers already past it get it recorded as claimed with
     * no bonus; otherwise their next referral would pay every milestone they
     * passed before it existed.
     */
    private async grandfatherNewMilestones(before: MilestoneState, after: MilestoneState) {
        const activeCounts = (c: MilestoneState) =>
            (c.rewardMode === 'MILESTONE' || c.rewardMode === 'HYBRID') && c.milestonesEnabled
                ? c.milestones.map(m => m.count)
                : [];

        const previously = new Set(activeCounts(before));
        const newlyActive = activeCounts(after).filter(count => !previously.has(count));

        if (newlyActive.length === 0) return;

        const progress = await prisma.referral.groupBy({
            by: ['referrerId'],
            where: { rewardGiven: true, ...(after.countOnlyActive && { hasLeftServer: false }) },
            _count: { _all: true },
        });

        const rows = newlyActive.flatMap(count =>
            progress
                .filter(p => p._count._all >= count)
                .map(p => ({ userId: p.referrerId, milestone: count, reward: 0 }))
        );

        if (rows.length === 0) return;

        const created = await prisma.referralMilestone.createMany({ data: rows, skipDuplicates: true });
        logger.info(
            `[ReferralReward] Milestones ${newlyActive.join(', ')} activated; ` +
                `${created.count} referrer(s) already past them recorded without a bonus`
        );
    }

    async getStats() {
        const [totalRewards, totalRewarded, activeReferrers] = await Promise.all([
            prisma.referral.count({ where: { rewardGiven: true, rewardAmount: { gt: 0 } } }),
            prisma.referral.aggregate({
                where: { rewardGiven: true },
                _sum: { rewardAmount: true },
            }),
            prisma.referral.groupBy({
                by: ['referrerId'],
                where: { rewardGiven: true, rewardAmount: { gt: 0 } },
                _count: true,
            }),
        ]);

        const config = await this.getConfig();

        const [orderPaid, orderPending] = await Promise.all([
            prisma.referralOrderReward.aggregate({ where: { status: 'PAID' }, _count: { _all: true }, _sum: { amount: true } }),
            prisma.referralOrderReward.aggregate({ where: { status: 'PENDING' }, _count: { _all: true }, _sum: { amount: true } }),
        ]);

        const joinRewarded = Number(totalRewarded._sum.rewardAmount || 0);
        const orderRewarded = Number(orderPaid._sum.amount || 0);

        return {
            totalRewards: totalRewards + orderPaid._count._all,
            totalRewarded: joinRewarded + orderRewarded,
            joinRewarded,
            orderRewards: {
                paidCount: orderPaid._count._all,
                paidAmount: orderRewarded,
                pendingCount: orderPending._count._all,
                pendingAmount: Number(orderPending._sum.amount || 0),
            },
            activeReferrers: activeReferrers.length,
            isEnabled: config.isEnabled,
            currencyName: config.currencyName,
        };
    }

    async getAllRewards(page: number = 1, limit: number = 10, search?: string) {
        const skip = (page - 1) * limit;

        const where: any = {
            rewardGiven: true,
            // Qualified referrals in MILESTONE mode are recorded with 0; only list actual payouts
            rewardAmount: { gt: 0 },
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
