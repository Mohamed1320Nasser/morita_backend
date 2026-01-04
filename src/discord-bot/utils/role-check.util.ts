import { Client, GuildMember } from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Check if a Discord user has admin or support role
 */
export async function isAdminOrSupport(client: Client, discordId: string): Promise<boolean> {
    try {
        const guild = await client.guilds.fetch(discordConfig.guildId);
        if (!guild) {
            logger.warn(`[RoleCheck] Guild ${discordConfig.guildId} not found`);
            return false;
        }

        const member = await guild.members.fetch(discordId);
        if (!member) {
            logger.warn(`[RoleCheck] Member ${discordId} not found in guild`);
            return false;
        }

        const hasAdminRole = member.roles.cache.has(discordConfig.adminRoleId);
        const hasSupportRole = member.roles.cache.has(discordConfig.supportRoleId);

        logger.debug(`[RoleCheck] User ${discordId} - Admin: ${hasAdminRole}, Support: ${hasSupportRole}`);

        return hasAdminRole || hasSupportRole;
    } catch (error) {
        logger.error(`[RoleCheck] Error checking roles for ${discordId}:`, error);
        return false;
    }
}

/**
 * Check if a Discord user has admin role
 */
export async function isAdmin(client: Client, discordId: string): Promise<boolean> {
    try {
        const guild = await client.guilds.fetch(discordConfig.guildId);
        if (!guild) return false;

        const member = await guild.members.fetch(discordId);
        if (!member) return false;

        return member.roles.cache.has(discordConfig.adminRoleId);
    } catch (error) {
        logger.error(`[RoleCheck] Error checking admin role for ${discordId}:`, error);
        return false;
    }
}

/**
 * Check if a Discord user has support role
 */
export async function isSupport(client: Client, discordId: string): Promise<boolean> {
    try {
        const guild = await client.guilds.fetch(discordConfig.guildId);
        if (!guild) return false;

        const member = await guild.members.fetch(discordId);
        if (!member) return false;

        return member.roles.cache.has(discordConfig.supportRoleId);
    } catch (error) {
        logger.error(`[RoleCheck] Error checking support role for ${discordId}:`, error);
        return false;
    }
}
