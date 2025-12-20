import { Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { getTicketService } from "../services/ticket.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

let cleanupInterval: NodeJS.Timeout | null = null;
let archiveInterval: NodeJS.Timeout | null = null;

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

    // Start archive job for old closed tickets
    startArchiveJob(client);
}

/**
 * Start archive job for old closed tickets
 */
function startArchiveJob(client: Client): void {
    if (archiveInterval) {
        clearInterval(archiveInterval);
    }

    // Run archive check every 1 hour
    const archiveIntervalMs = 60 * 60 * 1000;
    logger.info(`Starting archive job for closed tickets (interval: ${archiveIntervalMs}ms)`);

    archiveInterval = setInterval(async () => {
        try {
            await performArchive(client);
        } catch (error) {
            logger.error("Error in archive job:", error);
        }
    }, archiveIntervalMs);

    // Also run once immediately after 5 minutes of startup
    setTimeout(async () => {
        try {
            await performArchive(client);
        } catch (error) {
            logger.error("Error in initial archive run:", error);
        }
    }, 5 * 60 * 1000);
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

    if (archiveInterval) {
        clearInterval(archiveInterval);
        archiveInterval = null;
        logger.info("Archive job stopped");
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

/**
 * Perform archive of old closed tickets
 */
async function performArchive(client: Client): Promise<void> {
    try {
        const guild = client.guilds.cache.get(discordConfig.guildId);
        if (!guild) {
            logger.warn("Could not find guild for archive job");
            return;
        }

        const ticketService = getTicketService(client);
        await ticketService.archiveOldClosedTickets(guild);
    } catch (error) {
        logger.error("Error performing archive:", error);
    }
}
