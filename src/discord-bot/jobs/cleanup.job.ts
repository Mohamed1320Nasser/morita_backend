import { Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start cleanup job for expired messages
 */
export function startCleanupJob(client: Client): void {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }

    // Run cleanup every 2 minutes
    const cleanupIntervalMs = 2 * 60 * 1000;
    logger.info(`Starting cleanup job (interval: ${cleanupIntervalMs}ms)`);

    cleanupInterval = setInterval(async () => {
        try {
            await performCleanup(client);
        } catch (error) {
            logger.error("Error in cleanup job:", error);
        }
    }, cleanupIntervalMs);
}

/**
 * Stop cleanup job
 */
export function stopCleanupJob(): void {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
        logger.info("Cleanup job stopped");
    }
}

/**
 * Perform cleanup of expired messages
 */
async function performCleanup(client: Client): Promise<void> {
    try {
        await client.channelManager.cleanupExpiredMessages();
    } catch (error) {
        logger.error("Error performing cleanup:", error);
    }
}
