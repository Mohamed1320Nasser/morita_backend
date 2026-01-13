import { Service } from "typedi";
import discordClient from "../../discord-bot/index";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import { BadRequestError } from "routing-controllers";
import { discordConfig } from "../../discord-bot/config/discord.config";
import { onboardingConfig } from "../../discord-bot/config/onboarding.config";

// Channel types - matches Prisma enum
type DiscordChannelType = "PRICING" | "TOS" | "TICKETS";

interface ChannelStatus {
    channelType: string;
    channelId: string | null;
    channelName: string | null;
    status: "never_published" | "published" | "needs_update" | "error";
    lastPublishedAt: Date | null;
    lastPublishedBy: number | null;
    messageCount: number;
    lastError: string | null;
}

@Service()
export default class DiscordChannelsService {
    /**
     * Get status of all Discord channels
     */
    async getAllChannelsStatus(): Promise<{
        success: boolean;
        data: {
            botConnected: boolean;
            botUsername: string | undefined;
            channels: ChannelStatus[];
        };
    }> {
        const isConnected = discordClient.isReady();

        // Get all channel statuses from database
        // Note: Table may not exist yet if migration hasn't run
        let dbStatuses: any[] = [];
        try {
            dbStatuses = await (prisma as any).discordChannelPublishStatus.findMany();
        } catch (error) {
            // Table doesn't exist yet - that's ok, will show as never_published
            logger.debug("[DiscordChannelsService] Channel status table not found, showing default status");
        }

        // Build status for each channel type
        const channels: ChannelStatus[] = [];

        // Pricing Channel
        const pricingStatus = dbStatuses.find(s => s.channelType === "PRICING");
        const pricingChannel = isConnected && discordConfig.pricingChannelId
            ? discordClient.channels.cache.get(discordConfig.pricingChannelId)
            : null;

        channels.push({
            channelType: "PRICING",
            channelId: discordConfig.pricingChannelId || null,
            channelName: pricingChannel ? (pricingChannel as any).name : null,
            status: (pricingStatus?.status as any) || "never_published",
            lastPublishedAt: pricingStatus?.lastPublishedAt || null,
            lastPublishedBy: pricingStatus?.lastPublishedBy || null,
            messageCount: pricingStatus?.messageCount || 0,
            lastError: pricingStatus?.lastError || null,
        });

        // TOS Channel
        const tosStatus = dbStatuses.find(s => s.channelType === "TOS");
        const tosChannel = isConnected && onboardingConfig.tosChannelId
            ? discordClient.channels.cache.get(onboardingConfig.tosChannelId)
            : null;

        channels.push({
            channelType: "TOS",
            channelId: onboardingConfig.tosChannelId || null,
            channelName: tosChannel ? (tosChannel as any).name : null,
            status: (tosStatus?.status as any) || "never_published",
            lastPublishedAt: tosStatus?.lastPublishedAt || null,
            lastPublishedBy: tosStatus?.lastPublishedBy || null,
            messageCount: tosStatus?.messageCount || 0,
            lastError: tosStatus?.lastError || null,
        });

        // Ticket Channels
        const ticketsStatus = dbStatuses.find(s => s.channelType === "TICKETS");
        const ticketCategory = isConnected && discordConfig.createTicketCategoryId
            ? discordClient.channels.cache.get(discordConfig.createTicketCategoryId)
            : null;

        channels.push({
            channelType: "TICKETS",
            channelId: discordConfig.createTicketCategoryId || null,
            channelName: ticketCategory ? (ticketCategory as any).name : "CREATE TICKET (4 channels)",
            status: (ticketsStatus?.status as any) || "never_published",
            lastPublishedAt: ticketsStatus?.lastPublishedAt || null,
            lastPublishedBy: ticketsStatus?.lastPublishedBy || null,
            messageCount: ticketsStatus?.messageCount || 0,
            lastError: ticketsStatus?.lastError || null,
        });

        return {
            success: true,
            data: {
                botConnected: isConnected,
                botUsername: discordClient.user?.username,
                channels,
            },
        };
    }

    /**
     * Publish all channels
     */
    async publishAllChannels(userId?: number): Promise<{
        success: boolean;
        message: string;
        results: { channel: string; success: boolean; error?: string }[];
    }> {
        const results: { channel: string; success: boolean; error?: string }[] = [];

        // Publish pricing
        try {
            await this.publishPricingChannel(userId);
            results.push({ channel: "PRICING", success: true });
        } catch (error: any) {
            results.push({ channel: "PRICING", success: false, error: error.message });
        }

        // Publish TOS
        try {
            await this.publishTosChannel(userId);
            results.push({ channel: "TOS", success: true });
        } catch (error: any) {
            results.push({ channel: "TOS", success: false, error: error.message });
        }

        // Publish Tickets
        try {
            await this.publishTicketChannels(userId);
            results.push({ channel: "TICKETS", success: true });
        } catch (error: any) {
            results.push({ channel: "TICKETS", success: false, error: error.message });
        }

        const allSuccess = results.every(r => r.success);
        return {
            success: allSuccess,
            message: allSuccess
                ? "All channels published successfully"
                : "Some channels failed to publish",
            results,
        };
    }

    /**
     * Publish pricing channel
     */
    async publishPricingChannel(userId?: number): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }> {
        if (!discordClient.isReady()) {
            throw new BadRequestError("Discord bot not connected");
        }

        if (!discordClient.improvedChannelManager) {
            throw new BadRequestError("Pricing channel manager not initialized");
        }

        try {
            logger.info(`[DiscordChannelsService] Publishing pricing channel (triggered by user: ${userId || "system"})`);

            // Rebuild the channel
            await discordClient.improvedChannelManager.rebuildChannel();

            // Count messages in channel
            const manager = discordClient.improvedChannelManager as any;
            const messageCount = manager.categoryMessages?.size || 0;

            // Update status in database
            await this.updateChannelStatus("PRICING", {
                status: "published",
                lastPublishedAt: new Date(),
                lastPublishedBy: userId || null,
                messageCount: messageCount + 2, // header + footer + category messages
                channelId: discordConfig.pricingChannelId,
                lastError: null,
            });

            logger.info(`[DiscordChannelsService] Pricing channel published successfully`);

            return {
                success: true,
                message: "Pricing channel published successfully",
                data: {
                    channelId: discordConfig.pricingChannelId,
                    messageCount: messageCount + 2,
                    publishedAt: new Date(),
                },
            };
        } catch (error: any) {
            // Update status with error
            await this.updateChannelStatus("PRICING", {
                status: "error",
                lastError: error.message,
            });
            throw error;
        }
    }

    /**
     * Publish TOS channel
     */
    async publishTosChannel(userId?: number): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }> {
        if (!discordClient.isReady()) {
            throw new BadRequestError("Discord bot not connected");
        }

        if (!discordClient.tosManager) {
            throw new BadRequestError("TOS manager not initialized");
        }

        try {
            logger.info(`[DiscordChannelsService] Publishing TOS channel (triggered by user: ${userId || "system"})`);

            // Publish TOS
            await discordClient.tosManager.publishTos();

            // Update status in database
            await this.updateChannelStatus("TOS", {
                status: "published",
                lastPublishedAt: new Date(),
                lastPublishedBy: userId || null,
                messageCount: 1,
                channelId: onboardingConfig.tosChannelId,
                lastError: null,
            });

            logger.info(`[DiscordChannelsService] TOS channel published successfully`);

            return {
                success: true,
                message: "TOS channel published successfully",
                data: {
                    channelId: onboardingConfig.tosChannelId,
                    messageCount: 1,
                    publishedAt: new Date(),
                },
            };
        } catch (error: any) {
            await this.updateChannelStatus("TOS", {
                status: "error",
                lastError: error.message,
            });
            throw error;
        }
    }

    /**
     * Publish ticket channels
     */
    async publishTicketChannels(userId?: number): Promise<{
        success: boolean;
        message: string;
        data?: any;
    }> {
        if (!discordClient.isReady()) {
            throw new BadRequestError("Discord bot not connected");
        }

        if (!discordClient.ticketCategoryManager) {
            throw new BadRequestError("Ticket category manager not initialized");
        }

        try {
            logger.info(`[DiscordChannelsService] Publishing ticket channels (triggered by user: ${userId || "system"})`);

            // Publish tickets
            await discordClient.ticketCategoryManager.publishTickets();

            // Update status in database
            await this.updateChannelStatus("TICKETS", {
                status: "published",
                lastPublishedAt: new Date(),
                lastPublishedBy: userId || null,
                messageCount: 4, // 4 ticket channels
                channelId: discordConfig.createTicketCategoryId,
                lastError: null,
            });

            logger.info(`[DiscordChannelsService] Ticket channels published successfully`);

            return {
                success: true,
                message: "Ticket channels published successfully",
                data: {
                    categoryId: discordConfig.createTicketCategoryId,
                    channelCount: 4,
                    publishedAt: new Date(),
                },
            };
        } catch (error: any) {
            await this.updateChannelStatus("TICKETS", {
                status: "error",
                lastError: error.message,
            });
            throw error;
        }
    }

    /**
     * Update channel status in database
     */
    private async updateChannelStatus(
        channelType: "PRICING" | "TOS" | "TICKETS",
        data: {
            status?: string;
            lastPublishedAt?: Date;
            lastPublishedBy?: number | null;
            messageCount?: number;
            channelId?: string | null;
            lastError?: string | null;
        }
    ): Promise<void> {
        try {
            await (prisma as any).discordChannelPublishStatus.upsert({
                where: { channelType: channelType },
                create: {
                    channelType: channelType,
                    channelId: data.channelId,
                    status: data.status || "never_published",
                    lastPublishedAt: data.lastPublishedAt,
                    lastPublishedBy: data.lastPublishedBy,
                    messageCount: data.messageCount || 0,
                    lastError: data.lastError,
                },
                update: {
                    ...(data.channelId !== undefined && { channelId: data.channelId }),
                    ...(data.status !== undefined && { status: data.status }),
                    ...(data.lastPublishedAt !== undefined && { lastPublishedAt: data.lastPublishedAt }),
                    ...(data.lastPublishedBy !== undefined && { lastPublishedBy: data.lastPublishedBy }),
                    ...(data.messageCount !== undefined && { messageCount: data.messageCount }),
                    ...(data.lastError !== undefined && { lastError: data.lastError }),
                },
            });
        } catch (error) {
            // Table may not exist yet if migration hasn't run
            logger.warn("[DiscordChannelsService] Could not update channel status - migration may be needed");
        }
    }

    /**
     * Mark channel as needing update (called when data changes)
     */
    async markChannelNeedsUpdate(channelType: "PRICING" | "TOS" | "TICKETS"): Promise<void> {
        try {
            const currentStatus = await (prisma as any).discordChannelPublishStatus.findUnique({
                where: { channelType: channelType },
            });

            // Only mark as needs_update if it was previously published
            if (currentStatus?.status === "published") {
                await this.updateChannelStatus(channelType, {
                    status: "needs_update",
                });
            }
        } catch (error) {
            // Table may not exist yet
            logger.debug("[DiscordChannelsService] Could not mark channel needs update");
        }
    }
}
