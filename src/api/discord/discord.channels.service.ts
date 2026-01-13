import { Service } from "typedi";
import axios from "axios";
import logger from "../../common/loggers";

// Bot API runs on port 3002 (same server)
const BOT_API_URL = process.env.BOT_API_URL || "http://localhost:3002";

@Service()
export default class DiscordChannelsService {
    /**
     * Get status of all Discord channels
     * Proxies request to bot API
     */
    async getAllChannelsStatus(): Promise<any> {
        try {
            const response = await axios.get(`${BOT_API_URL}/discord/channels/status`);
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error getting channels status:", error.message);
            return {
                success: false,
                data: {
                    botConnected: false,
                    botUsername: undefined,
                    channels: [],
                },
                error: "Bot API not available. Make sure the Discord bot is running.",
            };
        }
    }

    /**
     * Publish all channels
     * Proxies request to bot API
     */
    async publishAllChannels(userId?: number): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/all`, { userId });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing all channels:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish all channels");
        }
    }

    /**
     * Publish pricing channel
     * Proxies request to bot API
     */
    async publishPricingChannel(userId?: number): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/pricing`, { userId });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing pricing channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish pricing channel");
        }
    }

    /**
     * Publish TOS channel
     * Proxies request to bot API
     */
    async publishTosChannel(userId?: number): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/tos`, { userId });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing TOS channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish TOS channel");
        }
    }

    /**
     * Publish ticket channels
     * Proxies request to bot API
     */
    async publishTicketChannels(userId?: number): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/tickets`, { userId });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing ticket channels:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish ticket channels");
        }
    }
}
