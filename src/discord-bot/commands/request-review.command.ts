import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    TextChannel,
} from "discord.js";
import { discordConfig } from "../config/discord.config";
import { getTicketService } from "../services/ticket.service";
import { extractErrorMessage } from "../utils/error-message.util";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("request-review")
        .setDescription("[SUPPORT/ADMIN] Ask the customer for a review without closing the ticket")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const member = interaction.member;
            const isSupport =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                await interaction.editReply({
                    content: "❌ Only support staff and admins can request a review.",
                });
                return;
            }

            const channel = interaction.channel as TextChannel;
            if (!channel) {
                await interaction.editReply({ content: "❌ This command must be used in a ticket channel." });
                return;
            }

            const ticketService = getTicketService(interaction.client);
            const ticket = await ticketService.getTicketByChannelId(channel.id);

            if (!ticket) {
                await interaction.editReply({
                    content: "❌ No ticket found for this channel. Run this inside the customer's ticket.",
                });
                return;
            }

            const result = await ticketService.requestReview(channel, ticket);

            if (!result.ok) {
                await interaction.editReply({ content: `❌ ${result.reason}` });
                return;
            }

            await interaction.editReply({
                content: `✅ Review request sent to <@${ticket.customerDiscordId}>. The ticket stays open.`,
            });

            logger.info(
                `[RequestReview] Ticket #${ticket.ticketNumber} review requested by ${interaction.user.tag}`
            );
        } catch (error: any) {
            logger.error("[RequestReview] Error:", error);
            await interaction.editReply({
                content: `❌ Failed to request review: ${extractErrorMessage(error)}`,
            });
        }
    },
};
