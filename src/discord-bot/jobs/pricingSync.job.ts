import { Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Start pricing sync job
 */
export function startPricingSyncJob(client: Client): void {
    if (syncInterval) {
        clearInterval(syncInterval);
    }

    logger.info(
        `Starting pricing sync job (interval: ${discordConfig.pricingSyncInterval}ms)`
    );

    syncInterval = setInterval(async () => {
        try {
            await performPricingSync(client);
        } catch (error) {
            logger.error("Error in pricing sync job:", error);
        }
    }, discordConfig.pricingSyncInterval);
}

/**
 * Stop pricing sync job
 */
export function stopPricingSyncJob(): void {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        logger.info("Pricing sync job stopped");
    }
}

/**
 * Perform pricing sync
 */
async function performPricingSync(client: Client): Promise<void> {
    try {
        const channelManager = client.channelManager;
        const apiService = new ApiService(discordConfig.apiBaseUrl);

        // Check if API is healthy
        const isHealthy = await apiService.healthCheck();
        if (!isHealthy) {
            logger.warn("API health check failed, skipping pricing sync");
            return;
        }

        // Check for updates by comparing with last sync
        const lastUpdate = await getLastPricingUpdate();
        const hasUpdates = await checkForUpdates(lastUpdate);

        if (hasUpdates) {
            logger.info(
                "Pricing updates detected, refreshing channel messages"
            );
            // Refresh cache first, then update messages
            await channelManager.refreshCache();
            await channelManager.updateCategoryMessages();
            await updateLastPricingUpdate();
        }

        // Clean up expired messages
        await channelManager.cleanupExpiredMessages();
    } catch (error) {
        logger.error("Error performing pricing sync:", error);
    }
}

/**
 * Get last pricing update timestamp
 */
async function getLastPricingUpdate(): Promise<Date> {
    // In a real implementation, you might store this in a database or cache
    // For now, we'll use a simple in-memory approach
    return new Date(0); // Always return epoch to force update for now
}

/**
 * Check for updates since last sync
 */
async function checkForUpdates(lastUpdate: Date): Promise<boolean> {
    // In a real implementation, you would:
    // 1. Query the database for recent changes to services/pricing
    // 2. Compare timestamps
    // 3. Return true if there are updates

    // For now, we'll always return true to ensure updates happen
    // This can be optimized later with proper change tracking
    return true;
}

/**
 * Update last pricing update timestamp
 */
async function updateLastPricingUpdate(): Promise<void> {
    // In a real implementation, you would store this timestamp
    // For now, we'll just log it
    logger.debug("Updated last pricing sync timestamp");
}
