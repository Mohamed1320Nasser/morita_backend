import { Collection, Guild, Invite } from "discord.js";
import logger from "../../common/loggers";

/**
 * InviteCache Service - Professional in-memory invite tracking
 *
 * This service maintains a cache of all server invites and their usage counts.
 * When a new member joins, we compare the cache against current invites to detect
 * which invite was used.
 *
 * Architecture:
 * - Cache stored in memory (fast, no DB overhead)
 * - Synced on bot startup and after each member join
 * - Detects invite usage by comparing use counts
 */
export class InviteCacheService {
    // Guild ID -> Collection of invites
    private cache: Map<string, Collection<string, CachedInvite>> = new Map();

    /**
     * Initialize cache for a guild by fetching all current invites
     */
    async cacheGuildInvites(guild: Guild): Promise<void> {
        try {
            logger.info(`[InviteCache] Caching invites for guild: ${guild.name}`);

            const invites = await guild.invites.fetch();
            const cachedInvites = new Collection<string, CachedInvite>();

            invites.forEach((invite: Invite) => {
                cachedInvites.set(invite.code, {
                    code: invite.code,
                    uses: invite.uses || 0,
                    inviterId: invite.inviter?.id || null,
                    inviterTag: invite.inviter?.tag || null,
                    channelId: invite.channelId || null,
                    createdAt: invite.createdAt || null,
                });
            });

            this.cache.set(guild.id, cachedInvites);
            logger.info(`[InviteCache] ✅ Cached ${cachedInvites.size} invites for ${guild.name}`);
        } catch (error: any) {
            logger.error(`[InviteCache] Failed to cache invites:`, error.message);
            throw error;
        }
    }

    // Joins are detected one at a time; see detectUsedInvite.
    private detectionQueue: Promise<unknown> = Promise.resolve();

    /**
     * Detect which invite was used by comparing cached vs current invites.
     *
     * Detections are serialised: two members joining at once both see the
     * same snapshot, and without the queue the second would find nothing.
     * The cache is advanced by exactly one use per detection, so if an
     * invite went up by two, the next queued join still finds its use.
     */
    detectUsedInvite(guild: Guild): Promise<UsedInviteInfo | null> {
        const run = this.detectionQueue.then(() => this.detectOnce(guild));
        this.detectionQueue = run.catch(() => null);
        return run;
    }

    private async detectOnce(guild: Guild): Promise<UsedInviteInfo | null> {
        try {
            const cachedInvites = this.cache.get(guild.id);
            if (!cachedInvites) {
                logger.warn(`[InviteCache] No cached invites for guild ${guild.name}, initializing cache`);
                await this.cacheGuildInvites(guild);
                return null;
            }

            const currentInvites = await guild.invites.fetch();

            for (const [code, currentInvite] of currentInvites) {
                const currentUses = currentInvite.uses || 0;
                let cachedInvite = cachedInvites.get(code);

                if (!cachedInvite) {
                    // Created after the last snapshot (e.g. while the bot was busy).
                    // If it already has uses, one of them is this join.
                    cachedInvite = {
                        code: currentInvite.code,
                        uses: 0,
                        inviterId: currentInvite.inviter?.id || null,
                        inviterTag: currentInvite.inviter?.tag || null,
                        channelId: currentInvite.channelId || null,
                        createdAt: currentInvite.createdAt || null,
                    };
                    cachedInvites.set(code, cachedInvite);
                }

                if (currentUses > cachedInvite.uses) {
                    logger.info(`[InviteCache] ✅ Detected used invite: ${code} (${cachedInvite.uses} → ${currentUses})`);

                    cachedInvite.uses += 1;

                    return {
                        code: currentInvite.code,
                        url: currentInvite.url,
                        inviterId: currentInvite.inviter?.id || null,
                        inviterTag: currentInvite.inviter?.tag || null,
                        inviterUsername: currentInvite.inviter?.username || null,
                        channelId: currentInvite.channelId || null,
                        uses: currentUses,
                    };
                }
            }

            // Invites that vanished: deleted, expired, or hit maxUses on this join
            for (const [code] of cachedInvites) {
                if (!currentInvites.has(code)) {
                    logger.info(`[InviteCache] Invite ${code} no longer exists, removing from cache`);
                    cachedInvites.delete(code);
                }
            }

            logger.warn(`[InviteCache] Could not detect which invite was used (no usage increase)`);
            return null;
        } catch (error: any) {
            logger.error(`[InviteCache] Error detecting used invite:`, error.message);
            return null;
        }
    }

    /** Keep the snapshot current when invites are created (InviteCreate event). */
    addInvite(guildId: string, invite: Invite): void {
        let cachedInvites = this.cache.get(guildId);
        if (!cachedInvites) {
            cachedInvites = new Collection<string, CachedInvite>();
            this.cache.set(guildId, cachedInvites);
        }

        cachedInvites.set(invite.code, {
            code: invite.code,
            uses: invite.uses || 0,
            inviterId: invite.inviter?.id || null,
            inviterTag: invite.inviter?.tag || null,
            channelId: invite.channelId || null,
            createdAt: invite.createdAt || null,
        });
    }

    /** Drop a deleted invite from the snapshot (InviteDelete event). */
    removeInvite(guildId: string, code: string): void {
        this.cache.get(guildId)?.delete(code);
    }

    /**
     * Get cached invites for a guild
     */
    getCachedInvites(guildId: string): Collection<string, CachedInvite> | null {
        return this.cache.get(guildId) || null;
    }

    /**
     * Get a specific user's invites (invites they created)
     */
    getUserInvites(guildId: string, userId: string): CachedInvite[] {
        const cachedInvites = this.cache.get(guildId);
        if (!cachedInvites) return [];

        return Array.from(cachedInvites.values()).filter(
            (invite) => invite.inviterId === userId
        );
    }

    /**
     * Clear cache for a guild
     */
    clearGuildCache(guildId: string): void {
        this.cache.delete(guildId);
        logger.info(`[InviteCache] Cleared cache for guild ${guildId}`);
    }

    /**
     * Get total invites across all guilds
     */
    getTotalCachedInvites(): number {
        let total = 0;
        for (const invites of this.cache.values()) {
            total += invites.size;
        }
        return total;
    }
}

/**
 * Cached invite data (lightweight, stored in memory)
 */
export interface CachedInvite {
    code: string;
    uses: number;
    inviterId: string | null;
    inviterTag: string | null;
    channelId: string | null;
    createdAt: Date | null;
}

/**
 * Information about the invite that was used
 */
export interface UsedInviteInfo {
    code: string;
    url: string;
    inviterId: string | null;
    inviterTag: string | null;
    inviterUsername: string | null;
    channelId: string | null;
    uses: number;
}
