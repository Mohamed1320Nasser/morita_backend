import { Service } from "typedi";
import axios from "axios";
import { BadRequestError, NotFoundError } from "routing-controllers";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";

export interface CampaignInput {
    name: string;
    platform: string;
    budget?: number;
    startDate?: string;
    endDate?: string | null;
    notes?: string | null;
    isActive?: boolean;
}

const round = (value: number, places = 2) => {
    const f = 10 ** places;
    return Math.round(value * f) / f;
};

/**
 * Marketing campaigns and their acquisition cost (KPI plan, Feature 9).
 * Each campaign has its own Discord invite; joins through it are signups.
 * A signup "converts" with their first completed order.
 */
@Service()
export default class CampaignService {
    async list() {
        const campaigns = await prisma.marketingCampaign.findMany({
            orderBy: { createdAt: "desc" },
            include: { signups: { select: { discordId: true, joinedAt: true } } },
        });

        return Promise.all(campaigns.map(async (campaign) => {
            const { signups, ...rest } = campaign;
            return { ...rest, budget: Number(campaign.budget), stats: await this.stats(campaign.budget, signups) };
        }));
    }

    /**
     * Funnel and cost figures for a campaign's signups:
     *   cost per signup          = budget / joins
     *   cost per paying customer = budget / customers with a completed order
     *   ROI %                    = (revenue - budget) / budget x 100
     * Revenue is the value of those customers' completed orders since joining.
     */
    private async stats(budgetValue: any, signups: Array<{ discordId: string; joinedAt: Date }>) {
        const budget = Number(budgetValue) || 0;
        const ids = signups.map((s) => s.discordId);
        const joinedAt = new Map(signups.map((s) => [s.discordId, s.joinedAt]));

        const [sessions, tickets, orders] = ids.length
            ? await Promise.all([
                  prisma.onboardingSession.findMany({
                      where: { discordId: { in: ids }, completedAt: { not: null } },
                      select: { discordId: true },
                  }),
                  prisma.ticket.findMany({
                      where: { customerDiscordId: { in: ids } },
                      select: { customerDiscordId: true, createdAt: true },
                  }),
                  prisma.order.findMany({
                      where: { status: "COMPLETED", customer: { discordId: { in: ids } } },
                      select: { orderValue: true, completedAt: true, createdAt: true, customer: { select: { discordId: true } } },
                  }),
              ])
            : [[], [], []];

        // Only activity after the member joined through the campaign counts
        const after = (discordId: string | null | undefined, at: Date | null) =>
            !!discordId && !!at && at >= (joinedAt.get(discordId) || new Date(0));

        const onboarded = new Set(sessions.map((s) => s.discordId)).size;
        const openedTicket = new Set(tickets.filter((t) => after(t.customerDiscordId, t.createdAt)).map((t) => t.customerDiscordId)).size;
        const countedOrders = orders.filter((o) => after(o.customer?.discordId, o.completedAt || o.createdAt));
        const buyers = new Set(countedOrders.map((o) => o.customer?.discordId)).size;
        const revenue = countedOrders.reduce((sum, o) => sum + Number(o.orderValue), 0);

        return {
            signups: ids.length,
            onboarded,
            openedTicket,
            buyers,
            revenue: round(revenue),
            conversionRate: ids.length ? round((buyers / ids.length) * 100, 1) : 0,
            costPerSignup: ids.length ? round(budget / ids.length) : null,
            costPerCustomer: buyers ? round(budget / buyers) : null,
            roi: budget > 0 ? round(((revenue - budget) / budget) * 100, 1) : null,
        };
    }

    async create(data: CampaignInput) {
        if (!data.name?.trim() || !data.platform?.trim()) {
            throw new BadRequestError("Name and platform are required");
        }

        // The campaign's own tracking link, created by the bot
        const invite = await this.createInvite(data.name.trim());

        const campaign = await prisma.marketingCampaign.create({
            data: {
                name: data.name.trim().slice(0, 120),
                platform: data.platform.trim().slice(0, 60),
                budget: Number(data.budget) || 0,
                startDate: data.startDate ? new Date(data.startDate) : new Date(),
                endDate: data.endDate ? new Date(data.endDate) : null,
                notes: data.notes || null,
                inviteCode: invite.inviteCode,
                inviteUrl: invite.inviteUrl,
            },
        });

        logger.info(`[Campaign] Created "${campaign.name}" (${campaign.platform}) with invite ${invite.inviteCode}`);
        return campaign;
    }

    async update(id: string, data: Partial<CampaignInput>) {
        const existing = await prisma.marketingCampaign.findUnique({ where: { id } });
        if (!existing) throw new NotFoundError("Campaign not found");

        return prisma.marketingCampaign.update({
            where: { id },
            data: {
                ...(data.name !== undefined && { name: data.name.trim().slice(0, 120) }),
                ...(data.platform !== undefined && { platform: data.platform.trim().slice(0, 60) }),
                ...(data.budget !== undefined && { budget: Number(data.budget) || 0 }),
                ...(data.startDate !== undefined && { startDate: new Date(data.startDate) }),
                ...(data.endDate !== undefined && { endDate: data.endDate ? new Date(data.endDate) : null }),
                ...(data.notes !== undefined && { notes: data.notes }),
                ...(data.isActive !== undefined && { isActive: !!data.isActive }),
            },
        });
    }

    /** A member joined through an invite: record it if the code is a campaign's */
    async trackJoin(inviteCode: string, discordId: string) {
        if (!inviteCode || !discordId) return { tracked: false };

        const campaign = await prisma.marketingCampaign.findUnique({ where: { inviteCode } });
        if (!campaign) return { tracked: false };

        await prisma.campaignSignup.upsert({
            where: { campaignId_discordId: { campaignId: campaign.id, discordId } },
            update: {},
            create: { campaignId: campaign.id, discordId },
        });

        logger.info(`[Campaign] ${discordId} joined through "${campaign.name}"`);
        return { tracked: true, campaign: campaign.name };
    }

    private async createInvite(name: string): Promise<{ inviteCode: string; inviteUrl: string }> {
        const botApiUrl = process.env.BOT_API_URL || "http://localhost:3002";
        try {
            const response = await axios.post(
                `${botApiUrl}/discord/campaign/invite`,
                { name },
                { timeout: 20000, headers: { "X-API-Key": process.env.DISCORD_BOT_API_KEY || "" } }
            );
            const invite = response.data?.data;
            if (!invite?.inviteCode) throw new Error("The bot returned no link");
            return invite;
        } catch (error: any) {
            const message = error?.response?.data?.error || error?.message || "Bot unavailable";
            logger.warn(`[Campaign] Could not create the campaign invite: ${message}`);
            throw new BadRequestError(`Could not create the invite link through the Discord bot: ${message}`);
        }
    }
}
