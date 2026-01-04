import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    TextChannel,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { getTicketService } from "../services/ticket.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

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

            // Get the ticket service
            const ticketService = getTicketService(interaction.client);

            // Get ticket by channel ID
            const ticket = await ticketService.getTicketByChannelId(channel.id);

            if (!ticket) {
                await interaction.editReply({
                    content:
                        "This command can only be used in ticket channels.",
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

            // Check if ticket has an associated order
            let associatedOrder = null;
            if (ticket.id) {
                try {
                    // Fetch order by ticketId
                    const orderResponse = await discordApiClient.get(
                        `/discord/orders/by-ticket/${ticket.id}`
                    );
                    associatedOrder = orderResponse.data?.data || orderResponse.data;
                } catch (error: any) {
                    // No order found - that's okay
                    if (error?.response?.status !== 404) {
                        logger.warn(`Error fetching order for ticket ${ticket.id}:`, error);
                    }
                }
            }

            // CUSTOMER RESTRICTIONS
            if (isCustomer && !isSupport && !isAdmin) {
                // Customer can ONLY close if NO order exists
                if (associatedOrder) {
                    const orderStatus = associatedOrder.status;

                    const embed = EmbedBuilder.createErrorEmbed(
                        `You cannot close this ticket because an order exists.\n\n` +
                        `**Order #${associatedOrder.orderNumber}**\n` +
                        `**Status:** ${orderStatus}\n` +
                        `**Worker:** ${associatedOrder.workerDiscordId ? `<@${associatedOrder.workerDiscordId}>` : 'Unassigned'}\n\n` +
                        `Please contact support if you need to close this ticket.`,
                        "❌ Cannot Close Ticket"
                    );

                    await interaction.editReply({
                        embeds: [embed as any],
                    });
                    return;
                }
            }

            // SUPPORT/ADMIN WARNING - Show confirmation if order exists
            if ((isSupport || isAdmin) && associatedOrder) {
                const orderStatus = associatedOrder.status;
                const riskyStatuses = ['IN_PROGRESS', 'COMPLETED', 'READY_FOR_REVIEW'];

                // If order is in a risky state, require confirmation
                if (riskyStatuses.includes(orderStatus)) {
                    let warningTitle = "⚠️ Confirm Ticket Closure";
                    let warningDescription =
                        `**WARNING:** This ticket has an active order!\n\n` +
                        `**Order #${associatedOrder.orderNumber}**\n` +
                        `**Status:** ${orderStatus}\n` +
                        `**Customer:** <@${associatedOrder.customerDiscordId}>\n` +
                        `**Worker:** ${associatedOrder.workerDiscordId ? `<@${associatedOrder.workerDiscordId}>` : 'Unassigned'}\n` +
                        `**Value:** $${associatedOrder.orderValue.toFixed(2)}\n\n`;

                    if (orderStatus === 'READY_FOR_REVIEW') {
                        warningDescription += `⚠️ **This order is awaiting customer review!**\n` +
                            `Closing now may cause payment/completion issues.\n\n`;
                    } else if (orderStatus === 'IN_PROGRESS') {
                        warningDescription += `⚠️ **Work is currently in progress!**\n` +
                            `The worker may still be completing this order.\n\n`;
                    } else if (orderStatus === 'COMPLETED') {
                        warningDescription += `✅ **Order is marked as completed.**\n` +
                            `This should be safe to close.\n\n`;
                    }

                    warningDescription += `**Are you sure you want to close this ticket?**\n` +
                        `Click "Confirm Close" to proceed or dismiss this message to cancel.`;

                    const embed = EmbedBuilder.createErrorEmbed(
                        warningDescription,
                        warningTitle
                    );

                    // Create confirmation button with ticket ID and reason encoded
                    const confirmButton = new ButtonBuilder()
                        .setCustomId(`confirm_close_ticket_${ticket.id}_${reason || 'none'}`)
                        .setLabel("Confirm Close Ticket")
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Danger);

                    const cancelButton = new ButtonBuilder()
                        .setCustomId(`cancel_close_ticket_${ticket.id}`)
                        .setLabel("Cancel")
                        .setEmoji("❌")
                        .setStyle(ButtonStyle.Secondary);

                    const actionRow = new ActionRowBuilder<ButtonBuilder>()
                        .addComponents(confirmButton, cancelButton);

                    await interaction.editReply({
                        embeds: [embed as any],
                        components: [actionRow as any],
                    });
                    return;
                }
            }

            // Close the ticket (no confirmation needed - safe to close)
            await ticketService.closeTicket(ticket.id, interaction.user, reason);

            await interaction.deleteReply();

            logger.info(
                `Ticket #${ticket.ticketNumber} closed by ${interaction.user.tag} via command${reason ? `: ${reason}` : ""}${associatedOrder ? ` | Order #${associatedOrder.orderNumber} status: ${associatedOrder.status}` : ""}`
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
