import { JsonController, Post, Get } from "routing-controllers";
import { Service } from "typedi";
import discordClient from "../../discord-bot/index";
import logger from "../../common/loggers";

/**
 * Discord Pricing Channel Management Controller
 * Provides endpoints to manage the Discord pricing channel
 */
@JsonController("/api/discord/pricing-channel")
@Service()
export default class DiscordPricingController {

    /**
     * Refresh Discord pricing channel
     * Clears all messages and rebuilds channel from scratch
     *
     * POST /api/discord/pricing-channel/refresh
     */
    @Post("/refresh")
    async refreshPricingChannel() {
        try {
            logger.info("[API] Refreshing Discord pricing channel...");

            // Check if bot is initialized
            if (!discordClient.improvedChannelManager) {
                return {
                    success: false,
                    error: "Discord bot not initialized"
                };
            }

            // Trigger channel rebuild (clears + rebuilds with 2-second delay)
            await discordClient.improvedChannelManager.rebuildChannel();

            logger.info("[API] Pricing channel refreshed successfully");

            return {
                success: true,
                message: "Pricing channel refreshed successfully"
            };
        } catch (error: any) {
            logger.error("[API] Error refreshing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to refresh pricing channel"
            };
        }
    }

    /**
     * Get Discord pricing channel status
     * Returns info about the channel and bot connection
     *
     * GET /api/discord/pricing-channel/status
     */
    @Get("/status")
    async getPricingChannelStatus() {
        try {
            const isConnected = discordClient.isReady();
            const hasChannelManager = !!discordClient.improvedChannelManager;

            let channelInfo = null;
            if (hasChannelManager && discordClient.improvedChannelManager) {
                // Access private field through type casting (for status check only)
                const manager = discordClient.improvedChannelManager as any;
                const channel = manager.pricingChannel;

                if (channel) {
                    channelInfo = {
                        id: channel.id,
                        name: channel.name,
                        messageCount: channel.messages.cache.size
                    };
                }
            }

            return {
                success: true,
                data: {
                    botConnected: isConnected,
                    botUsername: discordClient.user?.username,
                    botId: discordClient.user?.id,
                    channelManagerInitialized: hasChannelManager,
                    channel: channelInfo
                }
            };
        } catch (error: any) {
            logger.error("[API] Error getting pricing channel status:", error);
            return {
                success: false,
                error: error.message || "Failed to get status"
            };
        }
    }

    /**
     * Clear pricing channel messages only (without rebuilding)
     * Useful for testing or manual cleanup
     *
     * POST /api/discord/pricing-channel/clear
     */
    @Post("/clear")
    async clearPricingChannel() {
        try {
            logger.info("[API] Clearing Discord pricing channel...");

            if (!discordClient.improvedChannelManager) {
                return {
                    success: false,
                    error: "Discord bot not initialized"
                };
            }

            // Access clearChannel method (cast to any to access private method)
            const manager = discordClient.improvedChannelManager as any;
            await manager.clearChannel();

            logger.info("[API] Pricing channel cleared successfully");

            return {
                success: true,
                message: "Pricing channel cleared successfully"
            };
        } catch (error: any) {
            logger.error("[API] Error clearing pricing channel:", error);
            return {
                success: false,
                error: error.message || "Failed to clear pricing channel"
            };
        }
    }
}
