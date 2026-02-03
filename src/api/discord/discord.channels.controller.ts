import { JsonController, Post, Get, Authorized, CurrentUser, Body } from "routing-controllers";
import { Service } from "typedi";
import DiscordChannelsService from "./discord.channels.service";
import logger from "../../common/loggers";


@JsonController("/discord/channels")
@Service()
export default class DiscordChannelsController {
    constructor(private discordChannelsService: DiscordChannelsService) {}

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

    @Post("/publish/all")
    async publishAllChannels(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishAllChannels(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing all channels:", error);
            return {
                success: false,
                error: error.message || "Failed to publish all channels",
            };
        }
    }

    @Post("/publish/pricing")
    async publishPricingChannel(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishPricingChannel(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish pricing channel",
            };
        }
    }

    @Post("/publish/tos")
    async publishTosChannel(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishTosChannel(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing TOS channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish TOS channel",
            };
        }
    }

    @Post("/publish/tickets")
    async publishTicketChannels(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishTicketChannels(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing ticket channels:", error);
            return {
                success: false,
                error: error.message || "Failed to publish ticket channels",
            };
        }
    }

    @Post("/publish/accounts")
    async publishAccountsChannel(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishAccountsChannel(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing accounts channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish accounts channel",
            };
        }
    }

    @Post("/publish/payments")
    async publishPaymentsChannel(@CurrentUser() user?: any, @Body() body?: { clearAllMessages?: boolean }) {
        try {
            const userId = user?.id;
            const clearAllMessages = body?.clearAllMessages === true;
            return await this.discordChannelsService.publishPaymentsChannel(userId, clearAllMessages);
        } catch (error: any) {
            logger.error("[DiscordChannelsController] Error publishing payments channel:", error);
            return {
                success: false,
                error: error.message || "Failed to publish payments channel",
            };
        }
    }
}
