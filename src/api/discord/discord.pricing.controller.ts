import { JsonController, Post, Get } from "routing-controllers";
import { Service } from "typedi";
import DiscordPricingService from "./discord.pricing.service";
import logger from "../../common/loggers";

@JsonController("/discord/pricing")
@Service()
export default class DiscordPricingController {
    constructor(private discordPricingService: DiscordPricingService) {}

    @Post("/refresh")
    async refreshPricingChannel() {
        try {
            return await this.discordPricingService.refreshPricingChannel();
        } catch (error: any) {
            logger.error("[DiscordPricingController] Error refreshing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to refresh pricing channel",
            };
        }
    }

    @Get("/status")
    async getPricingChannelStatus() {
        try {
            return await this.discordPricingService.getPricingChannelStatus();
        } catch (error: any) {
            logger.error("[DiscordPricingController] Error getting pricing channel status:", error);
            return {
                success: false,
                error: error.message || "Failed to get status",
            };
        }
    }

    @Post("/clear")
    async clearPricingChannel() {
        try {
            return await this.discordPricingService.clearPricingChannel();
        } catch (error: any) {
            logger.error("[DiscordPricingController] Error clearing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to clear pricing channel",
            };
        }
    }
}
