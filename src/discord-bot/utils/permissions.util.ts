import { GuildMember, ButtonInteraction, CommandInteraction } from "discord.js";
import { discordConfig } from "../config/discord.config";

export function hasSupportOrAdminRole(member: GuildMember | null): boolean {
    if (!member) return false;

    const adminRoleId = discordConfig.adminRoleId;
    const supportRoleId = discordConfig.supportRoleId;

    const hasAdmin = adminRoleId ? member.roles.cache.has(adminRoleId) : false;
    const hasSupport = supportRoleId ? member.roles.cache.has(supportRoleId) : false;

    return hasAdmin || hasSupport;
}

export function hasWorkerRole(member: GuildMember | null): boolean {
    if (!member) return false;

    const workerRoleId = discordConfig.workersRoleId;
    return workerRoleId ? member.roles.cache.has(workerRoleId) : false;
}

export function hasAdminRole(member: GuildMember | null): boolean {
    if (!member) return false;

    const adminRoleId = discordConfig.adminRoleId;
    return adminRoleId ? member.roles.cache.has(adminRoleId) : false;
}

export async function requireSupportOrAdmin(
    interaction: ButtonInteraction | CommandInteraction
): Promise<boolean> {
    const member = interaction.member as GuildMember | null;

    if (!hasSupportOrAdminRole(member)) {
        const errorMessage = "❌ You don't have permission to perform this action. (Support/Admin only)";

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (error) {
            
        }

        return false;
    }

    return true;
}

export async function requireAdmin(
    interaction: ButtonInteraction | CommandInteraction
): Promise<boolean> {
    const member = interaction.member as GuildMember | null;

    if (!hasAdminRole(member)) {
        const errorMessage = "❌ You don't have permission to perform this action. (Admin only)";

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        } catch (error) {
            
        }

        return false;
    }

    return true;
}
