import { GuildMember } from "discord.js";
import prisma from "../../common/prisma/client";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Discord Role Priority (highest to lowest)
 * When user has multiple roles, use the highest priority
 */
const ROLE_PRIORITY = {
    admin: 4,
    support: 3,
    worker: 2,
    customer: 1,
} as const;

type DiscordRoleType = keyof typeof ROLE_PRIORITY;

/**
 * Get the highest priority Discord role for a member
 */
export function getHighestDiscordRole(member: GuildMember): DiscordRoleType {
    const hasAdmin = member.roles.cache.has(discordConfig.adminRoleId);
    const hasSupport = member.roles.cache.has(discordConfig.supportRoleId);
    const hasWorker = member.roles.cache.has(discordConfig.workersRoleId);

    if (hasAdmin) return "admin";
    if (hasSupport) return "support";
    if (hasWorker) return "worker";
    return "customer";
}

/**
 * Get the wallet type based on Discord role
 */
export function getWalletTypeFromRole(role: DiscordRoleType): "CUSTOMER" | "WORKER" | "SUPPORT" {
    switch (role) {
        case "admin":
        case "support":
            return "SUPPORT";
        case "worker":
            return "WORKER";
        default:
            return "CUSTOMER";
    }
}

/**
 * Sync Discord member's role and display name to database
 * Returns the updated user or null if not found
 */
export async function syncUserDiscordRole(member: GuildMember): Promise<{
    userId: number;
    discordRole: DiscordRoleType;
    walletType: "CUSTOMER" | "WORKER" | "SUPPORT";
    updated: boolean;
} | null> {
    try {
        const discordId = member.id;
        const highestRole = getHighestDiscordRole(member);
        const walletType = getWalletTypeFromRole(highestRole);

        // Find user by Discord ID
        const user = await prisma.user.findUnique({
            where: { discordId },
            include: { wallet: true },
        });

        if (!user) {
            logger.debug(`[RoleSync] User not found for Discord ID: ${discordId}`);
            return null;
        }

        let updated = false;

        // Check what needs to be updated
        const needsRoleUpdate = user.discordRole !== highestRole;
        const needsUsernameUpdate = user.discordUsername !== member.user.username;
        const needsDisplayNameUpdate = user.discordDisplayName !== member.displayName;
        const needsFullnameUpdate = user.fullname !== member.displayName;

        // Update user if any field changed
        if (needsRoleUpdate || needsUsernameUpdate || needsDisplayNameUpdate || needsFullnameUpdate) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    discordRole: highestRole,
                    discordUsername: member.user.username,
                    discordDisplayName: member.displayName,
                    fullname: member.displayName, // Keep fullname in sync with display name
                },
            });

            if (needsRoleUpdate) {
                logger.info(`[RoleSync] Updated user ${user.id} discordRole: ${user.discordRole} -> ${highestRole}`);
            }
            if (needsDisplayNameUpdate || needsFullnameUpdate) {
                logger.info(`[RoleSync] Updated user ${user.id} displayName: ${user.discordDisplayName} -> ${member.displayName}`);
            }
            updated = true;
        }

        // Update wallet type if exists and different
        if (user.wallet && user.wallet.walletType !== walletType) {
            await prisma.wallet.update({
                where: { id: user.wallet.id },
                data: { walletType },
            });
            logger.info(`[RoleSync] Updated wallet ${user.wallet.id} type: ${user.wallet.walletType} -> ${walletType}`);
            updated = true;
        }

        return {
            userId: user.id,
            discordRole: highestRole,
            walletType,
            updated,
        };
    } catch (error) {
        logger.error(`[RoleSync] Error syncing role for ${member.id}:`, error);
        return null;
    }
}

/**
 * Sync all members in a guild (for initial setup or manual sync)
 */
export async function syncAllGuildRoles(members: GuildMember[]): Promise<{
    total: number;
    synced: number;
    updated: number;
    errors: number;
}> {
    const result = { total: members.length, synced: 0, updated: 0, errors: 0 };

    for (const member of members) {
        try {
            const syncResult = await syncUserDiscordRole(member);
            if (syncResult) {
                result.synced++;
                if (syncResult.updated) result.updated++;
            }
        } catch (error) {
            result.errors++;
        }
    }

    logger.info(`[RoleSync] Guild sync complete: ${result.synced} synced, ${result.updated} updated, ${result.errors} errors`);
    return result;
}

/**
 * Get or create user with correct Discord role
 * Used when creating orders, wallets, etc.
 */
export async function ensureUserWithCorrectRole(
    discordId: string,
    member?: GuildMember | null
): Promise<{
    user: any;
    discordRole: DiscordRoleType;
    walletType: "CUSTOMER" | "WORKER" | "SUPPORT";
} | null> {
    try {
        // If we have the member, sync their role first
        if (member) {
            await syncUserDiscordRole(member);
        }

        const user = await prisma.user.findUnique({
            where: { discordId },
            include: { wallet: true },
        });

        if (!user) return null;

        const discordRole = (user.discordRole || "customer") as DiscordRoleType;
        const walletType = getWalletTypeFromRole(discordRole);

        return { user, discordRole, walletType };
    } catch (error) {
        logger.error(`[RoleSync] Error ensuring user role for ${discordId}:`, error);
        return null;
    }
}
