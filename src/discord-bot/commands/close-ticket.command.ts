import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    TextChannel,
} from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { getTicketService } from "../services/ticket.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("close-ticket")
        .setDescription("Close the current ticket (use in ticket channels)")
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Reason for closing the ticket")
                .setRequired(false)
                .setMaxLength(500)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Check if this is a ticket channel
            const channel = interaction.channel;
            if (!channel || !(channel instanceof TextChannel)) {
                await interaction.editReply({
                    content: "This command can only be used in text channels.",
                });
                return;
            }

            // Check if channel name matches ticket pattern
            if (!channel.name.startsWith(discordConfig.ticketChannelPrefix)) {
                await interaction.editReply({
                    content:
                        "This command can only be used in ticket channels.",
                });
                return;
            }

            // Get the ticket service
            const ticketService = getTicketService(interaction.client);

            // Get ticket by channel ID
            const ticket = await ticketService.getTicketByChannelId(channel.id);

            if (!ticket) {
                await interaction.editReply({
                    content:
                        "Could not find ticket information for this channel.",
                });
                return;
            }

            // Check permissions - customer, support, or admin can close
            const member = interaction.member;
            const isCustomer = ticket.customerDiscordId === interaction.user.id;
            const isSupport =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isCustomer && !isSupport && !isAdmin) {
                await interaction.editReply({
                    content: "You do not have permission to close this ticket.",
                });
                return;
            }

            // Get the reason if provided
            const reason = interaction.options.get("reason")?.value as
                | string
                | undefined;

            // Close the ticket
            await ticketService.closeTicket(ticket.id, interaction.user, reason);

            await interaction.editReply({
                content:
                    "Ticket has been closed. The channel will be archived shortly.",
            });

            logger.info(
                `Ticket #${ticket.ticketNumber} closed by ${interaction.user.tag} via command${reason ? `: ${reason}` : ""}`
            );
        } catch (error) {
            logger.error("Error executing close-ticket command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to close ticket. Please try again later.",
                "Close Ticket Error"
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [errorEmbed as any],
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
