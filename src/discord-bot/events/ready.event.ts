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

        // Set bot activity
        client.user?.setActivity("🎮 Morita Gaming | /help", { type: 1 });

        // Log bot information
        logger.info(`Bot ID: ${client.user?.id}`);
        logger.info(`Bot Username: ${client.user?.username}`);
        logger.info(`Bot Discriminator: ${client.user?.discriminator}`);
        logger.info(`Bot Avatar: ${client.user?.avatarURL()}`);

        // Log guild information
        const guilds = client.guilds.cache;
        logger.info(`Connected to ${guilds.size} guild(s):`);
        guilds.forEach(guild => {
            logger.info(
                `  - ${guild.name} (${guild.id}) - ${guild.memberCount} members`
            );
        });

        // Health check
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

        // Initialize pricing channel - OLD SYSTEM DISABLED
        // The old channelManager has been replaced by improvedChannelManager
        // Initialization now happens in index.ts
        // try {
        //     await client.channelManager.initializePricingChannel();
        //     logger.info("✅ Pricing channel initialized");
        // } catch (error) {
        //     logger.error("❌ Error initializing pricing channel:", error);
        // }

        // Start background jobs - DISABLED (old system)
        // Background sync is no longer needed - the improved channel manager
        // uses real-time event-driven updates instead of periodic polling
        // try {
        //     startPricingSyncJob(client);
        //     startCleanupJob(client);
        //     logger.info("✅ Background jobs started");
        // } catch (error) {
        //     logger.error("❌ Error starting background jobs:", error);
        // }
    },
};
