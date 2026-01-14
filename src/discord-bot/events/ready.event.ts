import { Events, Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { startPricingSyncJob } from "../jobs/pricingSync.job";
import { startCleanupJob } from "../jobs/cleanup.job";

import logger from "../../common/loggers";

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: Client) {
        logger.info(`Discord bot ready! Logged in as ${client.user?.tag}`);

        client.user?.setActivity("🎮 Morita Gaming | /help", { type: 1 });

        const guilds = client.guilds.cache;
        logger.info(`Connected to ${guilds.size} guild(s)`);

        try {
            const isHealthy = await client.apiService.healthCheck();
            if (isHealthy) {
                logger.info("✅ Backend API is healthy");
            } else {
                logger.warn("⚠️ Backend API health check failed");
            }
        } catch (error) {
            logger.error("❌ Backend API health check error:", error);
        }

    },
};
