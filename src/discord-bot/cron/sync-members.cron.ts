import { Client } from 'discord.js';
import cron from 'node-cron';
import { discordApiClient } from '../clients/DiscordApiClient';
import { discordConfig } from '../config/discord.config';
import { unwrapApiData } from '../utils/apiResponse.util';
import { notifyReferralPayout, AnyReferralPayout } from '../services/referralNotifier.service';
import logger from '../../common/loggers';

let processingPending = false;

/**
 * Pays referrals whose hold has cleared (days in server reached, cooldown or
 * daily cap passed, ...) and announces each payout.
 */
export async function processPendingReferralRewards(client: Client) {
    if (processingPending) return;
    processingPending = true;

    try {
        const response = await discordApiClient.post('/referral/process-pending');
        const result = unwrapApiData<{ enabled: boolean; checked: number; paid: AnyReferralPayout[]; held: number }>(response);

        if (!result?.enabled) return;

        for (const payout of result.paid || []) {
            await notifyReferralPayout(client, payout);
        }

        if (result.checked > 0) {
            logger.info(
                `[Cron] Referral rewards: ${result.paid?.length || 0} paid, ${result.held} still held (${result.checked} checked)`
            );
        }
    } catch (error: any) {
        const status = error?.response?.status;
        logger.error(
            `[Cron] ❌ Pending referral rewards failed${status ? ` (HTTP ${status})` : ''}: ${error?.message || error}`
        );
    } finally {
        processingPending = false;
    }
}

export function startMemberSyncCron(client: Client) {
    logger.info('[Cron] Member sync cron job initialized');

    cron.schedule('0 3 * * *', async () => {
        try {
            logger.info('[Cron] Starting daily member status sync...');

            const guild = client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                logger.error('[Cron] Guild not found');
                return;
            }

            const members = await guild.members.fetch();
            const memberIds = Array.from(members.keys()).map(id => ({ id }));

            // A partial or failed fetch would mark every referral as "left" and
            // wreck everyone's retention rate, so refuse an implausibly small list.
            if (memberIds.length === 0 || memberIds.length < guild.memberCount * 0.9) {
                logger.error(
                    `[Cron] Member fetch returned ${memberIds.length}/${guild.memberCount} members; skipping sync`
                );
                return;
            }

            logger.info(`[Cron] Fetched ${memberIds.length} guild members`);

            const response = await discordApiClient.post('/referral/sync-members', {
                guildMembers: memberIds
            });

            logger.info(`[Cron] ✅ Member sync complete:`, unwrapApiData(response));
        } catch (error: any) {
            const status = error?.response?.status;
            logger.error(
                `[Cron] ❌ Member sync failed${status ? ` (HTTP ${status})` : ''}: ${error?.message || error}`
            );
        }
    });

    logger.info('[Cron] Daily sync scheduled for 3:00 AM');

    // Every 10 minutes: pay referrals that have become eligible. Frequent enough
    // that a short cooldown does not stretch into hour-long waits per referrer.
    cron.schedule('*/10 * * * *', () => processPendingReferralRewards(client));
    logger.info('[Cron] Pending referral rewards scheduled every 10 minutes');
}
