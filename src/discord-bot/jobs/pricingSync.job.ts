import { Client } from "discord.js";
import { ChannelManagerService } from "../services/channelManager.service";
import { ApiService } from "../services/api.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

let syncInterval: NodeJS.Timeout | null = null;

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

export function stopPricingSyncJob(): void {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        logger.info("Pricing sync job stopped");
    }
}

async function performPricingSync(client: Client): Promise<void> {
    try {
        const channelManager = client.channelManager;
        const apiService = new ApiService(discordConfig.apiBaseUrl);

        const isHealthy = await apiService.healthCheck();
        if (!isHealthy) {
            logger.warn("API health check failed, skipping pricing sync");
            return;
        }

        const lastUpdate = await getLastPricingUpdate();
        const hasUpdates = await checkForUpdates(lastUpdate);

        if (hasUpdates) {
            logger.info(
                "Pricing updates detected, refreshing channel messages"
            );
            
            await channelManager.refreshCache();
            await channelManager.updateCategoryMessages();
            await updateLastPricingUpdate();
        }

        await channelManager.cleanupExpiredMessages();
    } catch (error) {
        logger.error("Error performing pricing sync:", error);
    }
}

async function getLastPricingUpdate(): Promise<Date> {

    return new Date(0); 
}

async function checkForUpdates(lastUpdate: Date): Promise<boolean> {

    return true;
}

async function updateLastPricingUpdate(): Promise<void> {

    logger.debug("Updated last pricing sync timestamp");
}
