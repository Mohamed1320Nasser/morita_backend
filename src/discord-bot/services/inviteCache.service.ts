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

    /**
     * Detect which invite was used by comparing cached vs current invites
     * Returns the invite that had its use count increased
     */
    async detectUsedInvite(guild: Guild): Promise<UsedInviteInfo | null> {
        try {
            const cachedInvites = this.cache.get(guild.id);
            if (!cachedInvites) {
                logger.warn(`[InviteCache] No cached invites for guild ${guild.name}, initializing cache`);
                await this.cacheGuildInvites(guild);
                return null;
            }

            // Fetch current invites
            const currentInvites = await guild.invites.fetch();

            // Compare each invite's use count
            for (const [code, currentInvite] of currentInvites) {
                const cachedInvite = cachedInvites.get(code);

                if (!cachedInvite) {
                    // New invite created since last cache - add it
                    cachedInvites.set(code, {
                        code: currentInvite.code,
                        uses: currentInvite.uses || 0,
                        inviterId: currentInvite.inviter?.id || null,
                        inviterTag: currentInvite.inviter?.tag || null,
                        channelId: currentInvite.channelId || null,
                        createdAt: currentInvite.createdAt || null,
                    });
                    continue;
                }

                const currentUses = currentInvite.uses || 0;
                const cachedUses = cachedInvite.uses;

                if (currentUses > cachedUses) {
                    // This invite was used!
                    logger.info(`[InviteCache] ✅ Detected used invite: ${code} (${cachedUses} → ${currentUses})`);

                    // Update cache
                    cachedInvite.uses = currentUses;

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

            // Check for deleted invites
            for (const [code, cachedInvite] of cachedInvites) {
                if (!currentInvites.has(code)) {
                    logger.info(`[InviteCache] Invite ${code} was deleted, removing from cache`);
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
