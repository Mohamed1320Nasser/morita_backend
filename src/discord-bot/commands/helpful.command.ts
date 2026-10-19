import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js";
import { discordConfig } from "../config/discord.config";
import { getEngagementTrackerService } from "../services/engagement-tracker.service";
import logger from "../../common/loggers";

/**
 * Support marks a member who helped others (KPI plan, Feature 3). It counts
 * toward their engagement score, which ranks the community leaderboard.
 */
export default {
    data: new SlashCommandBuilder()
        .setName("helpful")
        .setDescription("Mark a member as helpful to the community (Support/Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption(option =>
            option.setName("member").setDescription("The member who helped").setRequired(true)
        ),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        const member = interaction.member;
        const roles = member && "roles" in member ? (member.roles as any).cache : null;
        if (!roles?.has(discordConfig.supportRoleId) && !roles?.has(discordConfig.adminRoleId)) {
            await interaction.editReply({ content: "❌ Only support staff and admins can mark members as helpful." });
            return;
        }

        const target = interaction.options.getUser("member", true);
        if (target.bot || target.id === interaction.user.id) {
            await interaction.editReply({ content: "❌ Pick another member (not yourself or a bot)." });
            return;
        }

        try {
            await getEngagementTrackerService(interaction.client).markHelpful({
                id: target.id,
                username: target.username,
                displayName: target.globalName,
            });
            logger.info(`[Helpful] ${interaction.user.tag} marked ${target.tag} as helpful`);
            await interaction.editReply({ content: `✅ <@${target.id}> marked as helpful. It counts toward their engagement score.` });
        } catch (error: any) {
            logger.error(`[Helpful] Failed: ${error?.message || error}`);
            await interaction.editReply({ content: "❌ Could not save that. Please try again." });
        }
    },
};
