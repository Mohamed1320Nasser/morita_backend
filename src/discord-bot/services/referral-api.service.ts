import { Client, Guild, Invite, Collection } from "discord.js";
import logger from "../../common/loggers";
import { discordConfig } from "../config/discord.config";
import { discordApiClient } from "../clients/DiscordApiClient";

export class ReferralApiService {
    private client: Client;
    private invites: Collection<string, Collection<string, Invite>> = new Collection();

    constructor(client: Client) {
        this.client = client;
    }

    async cacheInvites(): Promise<void> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) return;

            const invites = await guild.invites.fetch();
            this.invites.set(guild.id, invites);

            logger.info(`[Referral] Cached ${invites.size} invites`);
        } catch (error) {
            logger.error("[Referral] Failed to cache invites:", error);
        }
    }

    async findUsedInvite(guild: Guild, newMemberId?: string): Promise<Invite | null> {
        try {
            logger.info(`[Referral] 🔍 Starting database-backed referral detection for member: ${newMemberId}`);

            // STEP 1: Sync Discord invites with database to get current state
            try {
                const syncResponse = await discordApiClient.post('/referral/invite/sync', {
                    guildId: guild.id
                });
                logger.info(`[Referral] ✅ Synced invites with database:`, syncResponse.data);
            } catch (syncError: any) {
                logger.error(`[Referral] ❌ Failed to sync invites:`, syncError.message);
            }

            // STEP 2: Get all active invites from database (our source of truth)
            const dbInvitesResponse = await discordApiClient.get('/referral/invite/list');
            const dbInvites = dbInvitesResponse.data;
            logger.info(`[Referral] 📊 Got ${dbInvites?.length || 0} invites from database`);

            // STEP 3: Fetch current Discord invites
            const discordInvites = await guild.invites.fetch();
            logger.info(`[Referral] 📊 Got ${discordInvites.size} invites from Discord API`);

            // STEP 4: Compare usage counts to find which invite was used
            for (const dbInvite of dbInvites) {
                const discordInvite = discordInvites.get(dbInvite.inviteCode);

                if (discordInvite) {
                    const oldUses = dbInvite.uses;
                    const newUses = discordInvite.uses || 0;

                    logger.info(`[Referral] Invite ${dbInvite.inviteCode}: ${oldUses} → ${newUses} uses (owner: ${dbInvite.discordId})`);

                    if (newUses > oldUses) {
                        logger.info(`[Referral] ✅ Found used invite: ${dbInvite.inviteCode} (increased by ${newUses - oldUses})`);

                        // Update usage count in database
                        try {
                            await discordApiClient.post('/referral/invite/update-usage', {
                                inviteCode: dbInvite.inviteCode,
                                uses: newUses
                            });
                            logger.info(`[Referral] Updated invite usage in database`);
                        } catch (updateError: any) {
                            logger.error(`[Referral] Failed to update invite usage:`, updateError.message);
                        }

                        return discordInvite;
                    }
                } else {
                    logger.warn(`[Referral] ⚠️ Invite ${dbInvite.inviteCode} from DB not found in Discord (may be deleted)`);
                }
            }

            logger.warn(`[Referral] Could not determine which invite was used (no usage increase detected)`);
            return null;
        } catch (error) {
            logger.error("[Referral] Error finding used invite:", error);
            return null;
        }
    }

    async trackReferral(
        referrerDiscordId: string,
        referredDiscordId: string,
        inviteCode: string
    ): Promise<void> {
        try {
            await discordApiClient.post('/referral/track', {
                referrerDiscordId,
                referredDiscordId,
                inviteCode,
            });

            logger.info(`[Referral] Tracked: ${referrerDiscordId} → ${referredDiscordId}`);
        } catch (error: any) {
            logger.error('[Referral] Failed to track:', error.message);
        }
    }

    async giveReferralReward(referredDiscordId: string, amount?: number): Promise<any> {
        try {
            const payload: any = { referredDiscordId };
            if (amount !== undefined) {
                payload.amount = amount;
            }

            const response: any = await discordApiClient.post('/referral/reward', payload);

            if (response?.data) {
                if (response.data.data === null) {
                    return null;
                } else {
                    const rewardAmount = response.data.data.amount || amount || 0;
                    logger.info(`[Referral] Reward sent: $${rewardAmount}`);
                    return response.data.data;
                }
            }
        } catch (error: any) {
            logger.error('[Referral] Failed to give reward:', error.message);
            throw error;
        }
    }

    async getReferralStats(discordId: string) {
        try {
            const response: any = await discordApiClient.get(
                `/referral/stats/discord/${discordId}`
            );

            return response?.data || null;
        } catch (error: any) {
            logger.error('[Referral] Failed to get stats:', error.message);
            return null;
        }
    }

    async getLeaderboard(limit: number = 10) {
        try {
            const response: any = await discordApiClient.get(
                `/referral/leaderboard?limit=${limit}`
            );

            return response?.data || [];
        } catch (error: any) {
            logger.error('[Referral] Failed to get leaderboard:', error.message);
            return [];
        }
    }
}
