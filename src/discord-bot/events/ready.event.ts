import { Events, Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { startCleanupJob } from "../jobs/cleanup.job";
import { getMentionTrackerService } from "../services/mention-tracker.service";
import { getDailyRewardReminderService } from "../services/daily-reward-reminder.service";

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

        // Start mention tracker service for auto-reminders
        try {
            const mentionTracker = getMentionTrackerService(client);
            mentionTracker.start();
            logger.info("✅ Mention tracker service started");
        } catch (error) {
            logger.error("❌ Failed to start mention tracker service:", error);
        }

        try {
            getDailyRewardReminderService(client).start();
            logger.info("✅ Daily reward reminder service started");
        } catch (error) {
            logger.error("❌ Failed to start daily reward reminder service:", error);
        }

        try {
            startCleanupJob(client);
            logger.info(
                "✅ Cleanup jobs started (account reservations, ticket archiving)"
            );
        } catch (error) {
            logger.error("❌ Failed to start cleanup jobs:", error);
        }
    },
};
