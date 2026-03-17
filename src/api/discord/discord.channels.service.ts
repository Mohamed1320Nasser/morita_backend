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

    /**
     * Get ALL Discord channels from the guild (not just system channels)
     * @returns All text channels in the Discord server
     */
    async getAllGuildChannels(): Promise<any> {
        try {
            const response = await axios.get(`${BOT_API_URL}/discord/channels/all`);
            return response.data?.data || response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error getting all guild channels:", error.message);
            return {
                botConnected: false,
                channels: [],
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

    async publishPaymentsChannel(userId?: number, clearAllMessages: boolean = false): Promise<any> {
        try {
            const response = await axios.post(`${BOT_API_URL}/discord/channels/publish/payments`, { userId, clearAllMessages });
            return response.data;
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error publishing payments channel:", error.message);
            throw new Error(error.response?.data?.error || "Failed to publish payments channel");
        }
    }

    /**
     * Get channel name by channel ID
     * @param channelId - Discord channel ID
     * @returns Channel name or null if not found
     */
    async getChannelNameById(channelId: string): Promise<string | null> {
        try {
            const channelsData = await this.getAllChannelsStatus();
            const channel = channelsData.channels?.find((ch: any) => ch.id === channelId);
            return channel?.name || null;
        } catch (error: any) {
            logger.error(`[DiscordChannelsService] Error getting channel name for ${channelId}:`, error.message);
            return null;
        }
    }

    /**
     * Get multiple channel names by IDs
     * @param channelIds - Array of Discord channel IDs
     * @returns Map of channel ID to channel name
     */
    async getChannelNamesByIds(channelIds: string[]): Promise<Map<string, string>> {
        const channelMap = new Map<string, string>();

        try {
            const channelsData = await this.getAllChannelsStatus();
            const channels = channelsData.channels || [];

            channelIds.forEach(channelId => {
                const channel = channels.find((ch: any) => ch.id === channelId);
                if (channel?.name) {
                    channelMap.set(channelId, channel.name);
                }
            });
        } catch (error: any) {
            logger.error("[DiscordChannelsService] Error getting channel names:", error.message);
        }

        return channelMap;
    }
}
