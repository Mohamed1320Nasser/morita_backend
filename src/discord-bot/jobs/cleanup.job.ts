import { Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { getTicketService } from "../services/ticket.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import axios from "axios";

let cleanupInterval: NodeJS.Timeout | null = null;
let archiveInterval: NodeJS.Timeout | null = null;
let accountReservationInterval: NodeJS.Timeout | null = null;

export function startCleanupJob(client: Client): void {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }

    const cleanupIntervalMs = 2 * 60 * 1000;
    logger.info(`Starting cleanup job (interval: ${cleanupIntervalMs}ms)`);

    cleanupInterval = setInterval(async () => {
        try {
            await performCleanup(client);
        } catch (error) {
            logger.error("Error in cleanup job:", error);
        }
    }, cleanupIntervalMs);

    startArchiveJob(client);
    startAccountReservationCleanup();
}

function startArchiveJob(client: Client): void {
    if (archiveInterval) {
        clearInterval(archiveInterval);
    }

    const archiveIntervalMs = 60 * 60 * 1000;
    logger.info(`Starting archive job for closed tickets (interval: ${archiveIntervalMs}ms)`);

    archiveInterval = setInterval(async () => {
        try {
            await performArchive(client);
        } catch (error) {
            logger.error("Error in archive job:", error);
        }
    }, archiveIntervalMs);

    setTimeout(async () => {
        try {
            await performArchive(client);
        } catch (error) {
            logger.error("Error in initial archive run:", error);
        }
    }, 5 * 60 * 1000);
}

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

    if (accountReservationInterval) {
        clearInterval(accountReservationInterval);
        accountReservationInterval = null;
        logger.info("Account reservation cleanup job stopped");
    }
}

/**
 * Start account reservation cleanup job
 * Releases expired account reservations every 5 minutes
 */
function startAccountReservationCleanup(): void {
    if (accountReservationInterval) {
        clearInterval(accountReservationInterval);
    }

    const intervalMs = 5 * 60 * 1000; // 5 minutes
    logger.info(`Starting account reservation cleanup job (interval: ${intervalMs}ms)`);

    // Run immediately on startup
    setTimeout(async () => {
        try {
            await releaseExpiredAccountReservations();
        } catch (error) {
            logger.error("Error in initial account reservation cleanup:", error);
        }
    }, 10 * 1000); // Wait 10 seconds after startup

    accountReservationInterval = setInterval(async () => {
        try {
            await releaseExpiredAccountReservations();
        } catch (error) {
            logger.error("Error in account reservation cleanup job:", error);
        }
    }, intervalMs);
}

/**
 * Call API to release expired account reservations
 */
async function releaseExpiredAccountReservations(): Promise<void> {
    try {
        const response = await axios.post(
            `${discordConfig.apiBaseUrl}/accounts/release-expired`
        );

        const released = response.data?.released || response.data?.data?.released || 0;
        if (released > 0) {
            logger.info(`[AccountReservation] Released ${released} expired account reservation(s)`);
        }
    } catch (error) {
        logger.error("[AccountReservation] Error releasing expired reservations:", error);
    }
}

async function performCleanup(client: Client): Promise<void> {
    try {
        await client.channelManager.cleanupExpiredMessages();
    } catch (error) {
        logger.error("Error performing cleanup:", error);
    }
}

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
