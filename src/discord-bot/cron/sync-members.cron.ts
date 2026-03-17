import { Client } from 'discord.js';
import cron from 'node-cron';
import { discordApiClient } from '../clients/DiscordApiClient';
import { discordConfig } from '../config/discord.config';
import logger from '../../common/loggers';

export function startMemberSyncCron(client: Client) {
    logger.info('[Cron] Member sync cron job initialized');

    cron.schedule('0 3 * * *', async () => {
        logger.info('[Cron] Starting daily member status sync...');

        const guild = client.guilds.cache.get(discordConfig.guildId);
        if (!guild) {
            logger.error('[Cron] Guild not found');
            return;
        }

        const members = await guild.members.fetch();
        const memberIds = Array.from(members.keys()).map(id => ({ id }));

        logger.info(`[Cron] Fetched ${memberIds.length} guild members`);

        const response = await discordApiClient.post('/referral/sync-members', {
            guildMembers: memberIds
        });

        logger.info(`[Cron] ✅ Member sync complete:`, response.data);
    });

    logger.info('[Cron] Daily sync scheduled for 3:00 AM');
}
