import { Service } from "typedi";
import axios from "axios";
import logger from "../../common/loggers";

const BOT_API_URL = process.env.BOT_API_URL || "http://localhost:3002";

@Service()
export default class DiscordChannelsService {
    async getAllChannelsStatus(): Promise<any> {
        try {
            const response = await axios.get(`${BOT_API_URL}/discord/channels/status`);
            return response.data?.data || response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error getting channels status:", error.message);
            return {
                botConnected: false,
                botUsername: undefined,
                channels: [],
                error: "Bot API not available. Make sure the Discord bot is running.",
            };
        }
    }

    async publishAllChannels(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/all`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing all channels:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish all channels");
        }
    }

    async publishPricingChannel(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/pricing`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing pricing channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish pricing channel");
        }
    }

    async publishTosChannel(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/tos`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing TOS channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish TOS channel");
        }
    }

    async publishTicketChannels(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/tickets`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing ticket channels:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish ticket channels");
        }
    }

    async publishAccountsChannel(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/accounts`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing accounts channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish accounts channel");
        }
    }
}
