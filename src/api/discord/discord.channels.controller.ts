import { JsonController, Post, Get, Authorized, CurrentUser } from "routing-controllers";
import { Service } from "typedi";
import DiscordChannelsService from "./discord.channels.service";
import logger from "../../common/loggers";

/**
 * Discord Channels Controller
 * Provides endpoints for manual publishing to Discord channels
 *
 * Endpoints:
 * - GET  /discord/channels/status - Get status of all channels
 * - POST /discord/channels/publish/all - Publish all channels
 * - POST /discord/channels/publish/pricing - Publish pricing channel
 * - POST /discord/channels/publish/tos - Publish TOS channel
 * - POST /discord/channels/publish/tickets - Publish ticket channels
 */
@JsonController("/discord/channels")
@Service()
export default class DiscordChannelsController {
    constructor(private discordChannelsService: DiscordChannelsService) {}

    /**
     * Get status of all Discord channels
     * Returns last published time, status, and sync state
     */
    @Get("/status")
    async getAllChannelsStatus() {
        try {
            return await this.discordChannelsService.getAllChannelsStatus();
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error getting channels status:", error);
            return {
                success: false,
                error: error.message || "Failed to get channels status",
            };
        }
    }

    /**
     * Publish all channels to Discord
     */
    @Post("/publish/all")
    async publishAllChannels(@CurrentUser() user?: any) {
        try {
            const userId = user?.id;
            return await this.discordChannelsService.publishAllChannels(userId);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing all channels:", error);
            return {
                success: false,
                error: error.message || "Failed to publish all channels",
            };
        }
    }

    /**
     * Publish pricing/services channel
     */
    @Post("/publish/pricing")
    async publishPricingChannel(@CurrentUser() user?: any) {
        try {
            const userId = user?.id;
            return await this.discordChannelsService.publishPricingChannel(userId);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish pricing channel",
            };
        }
    }

    /**
     * Publish TOS channel
     */
    @Post("/publish/tos")
    async publishTosChannel(@CurrentUser() user?: any) {
        try {
            const userId = user?.id;
            return await this.discordChannelsService.publishTosChannel(userId);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing TOS channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish TOS channel",
            };
        }
    }

    /**
     * Publish ticket channels (4 channels)
     */
    @Post("/publish/tickets")
    async publishTicketChannels(@CurrentUser() user?: any) {
        try {
            const userId = user?.id;
            return await this.discordChannelsService.publishTicketChannels(userId);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing ticket channels:", error);
            return {
                success: false,
                error: error.message || "Failed to publish ticket channels",
            };
        }
    }
}
