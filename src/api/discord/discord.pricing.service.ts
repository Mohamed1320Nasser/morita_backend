import { Service } from "typedi";
import discordClient from "../../discord-bot/index";
import logger from "../../common/loggers";
import { BadRequestError } from "routing-controllers";

@Service()
export default class DiscordPricingService {
    async refreshPricingChannel() {;

        if (!discordClient.improvedChannelManager) {
            throw new BadRequestError("Discord bot not initialized");
        }

        await discordClient.improvedChannelManager.rebuildChannel();
        return {
            success: true,
            message: "Pricing channel refreshed successfully",
        };
    }

    async getPricingChannelStatus() {
        const isConnected = discordClient.isReady();
        const hasChannelManager = !!discordClient.improvedChannelManager;

        let channelInfo = null;
        if (hasChannelManager && discordClient.improvedChannelManager) {
            const manager = discordClient.improvedChannelManager as any;
            const channel = manager.pricingChannel;

            if (channel) {
                channelInfo = {
                    id: channel.id,
                    name: channel.name,
                    messageCount: channel.messages.cache.size,
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
                channel: channelInfo,
            },
        };
    }

    async clearPricingChannel() {
        if (!discordClient.improvedChannelManager) {
            throw new BadRequestError("Discord bot not initialized");
        }

        const manager = discordClient.improvedChannelManager as any;
        await manager.clearChannel();

        return {
            success: true,
            message: "Pricing channel cleared successfully",
        };
    }
}
