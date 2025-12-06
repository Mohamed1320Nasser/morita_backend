import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService } from "../../services/ticket.service";
import { discordConfig } from "../../config/discord.config";

/**
 * Handle the Open Ticket button click
 * This can be triggered from:
 * 1. Calculator results (with service and price info)
 * 2. General help/support button (without service info)
 */
export async function handleOpenTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Parse the custom ID to get any passed data
        // Format: open_ticket OR open_ticket_<serviceId>_<categoryId>_<price>
        const customIdParts = interaction.customId.split("_");
        let serviceId: string | undefined;
        let categoryId: string | undefined;
        let calculatedPrice: number | undefined;

        if (customIdParts.length > 2) {
            // Has additional data
            serviceId = customIdParts[2] || undefined;
            categoryId = customIdParts[3] || undefined;
            calculatedPrice = customIdParts[4]
                ? parseFloat(customIdParts[4])
                : undefined;
        }

        // Create the ticket details modal
        const modal = new ModalBuilder()
            .setCustomId(
                `ticket_create_modal_${serviceId || "general"}_${categoryId || "general"}_${calculatedPrice || 0}`
            )
            .setTitle("Open Support Ticket");

        // Service description input
        const descriptionInput = new TextInputBuilder()
            .setCustomId("ticket_description")
            .setLabel("Describe your request")
            .setPlaceholder(
                "Please describe what you need help with or any additional details..."
            )
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        // Optional OSRS username
        const usernameInput = new TextInputBuilder()
            .setCustomId("ticket_osrs_username")
            .setLabel("OSRS Username (Optional)")
            .setPlaceholder("Your in-game username")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50);

        // Contact preference
        const contactInput = new TextInputBuilder()
            .setCustomId("ticket_contact")
            .setLabel("Preferred Contact Method (Optional)")
            .setPlaceholder("Discord DM, in-game, etc.")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100);

        // Add inputs to action rows
        const row1 =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                descriptionInput
            );
        const row2 =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                usernameInput
            );
        const row3 =
            new ActionRowBuilder<TextInputBuilder>().addComponents(contactInput);

        modal.addComponents(row1, row2, row3);

        await interaction.showModal(modal as any);

        logger.info(
            `Ticket modal opened by ${interaction.user.tag}${serviceId ? ` for service ${serviceId}` : ""}`
        );
    } catch (error) {
        logger.error("Error handling open ticket button:", error);

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content:
                    "Failed to open ticket form. Please try again or contact support directly.",
                ephemeral: true,
            });
        } else {
            await interaction.reply({
                content:
                    "Failed to open ticket form. Please try again or contact support directly.",
                ephemeral: true,
            });
        }
    }
}

/**
 * Handle ticket calculate button (within a ticket channel)
 */
export async function handleTicketCalculate(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const ticketId = interaction.customId.replace("ticket_calculate_", "");

        // Get the ticket service
        const ticketService = getTicketService(interaction.client);
        const ticket = await ticketService.getTicketById(ticketId);

        if (!ticket) {
            await interaction.reply({
                content: "Could not find ticket information.",
                ephemeral: true,
            });
            return;
        }

        // If the ticket has a service, show the calculator modal for that service
        if (ticket.serviceId) {
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

            // Use special customId to indicate this is from within a ticket (no "Open Ticket" button needed)
            const modal = new ModalBuilder()
                .setCustomId(`calculator_modal_inticket_${ticket.serviceId}`)
                .setTitle("Price Calculator");

            const startLevelInput = new TextInputBuilder()
                .setCustomId("start_level")
                .setLabel("Start Level")
                .setPlaceholder("Enter your current level (1-99)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(2);

            const endLevelInput = new TextInputBuilder()
                .setCustomId("end_level")
                .setLabel("End Level")
                .setPlaceholder("Enter your target level (1-99)")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMinLength(1)
                .setMaxLength(2);

            const row1 = new ActionRowBuilder().addComponents(startLevelInput);
            const row2 = new ActionRowBuilder().addComponents(endLevelInput);

            modal.addComponents(row1, row2);

            await interaction.showModal(modal as any);
        } else {
            // No service selected, show general calculator info
            await interaction.reply({
                content:
                    "Use the `/pricing` command to browse services and calculate prices.",
                ephemeral: true,
            });
        }
    } catch (error) {
        logger.error("Error handling ticket calculate button:", error);
        await interaction.reply({
            content: "Failed to open calculator. Please try again.",
            ephemeral: true,
        });
    }
}

/**
 * Handle ticket close button
 */
export async function handleTicketClose(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const ticketId = interaction.customId.replace("ticket_close_", "");

        // Check if user has permission to close (customer, support, or admin)
        // Support and Admin can always close tickets
        const member = interaction.member;
        const isSupport =
            member &&
            "roles" in member &&
            (member.roles as any).cache?.has(discordConfig.supportRoleId);
        const isAdmin =
            member &&
            "roles" in member &&
            (member.roles as any).cache?.has(discordConfig.adminRoleId);

        // If user is support or admin, skip the API call and show modal immediately
        // Customer permission will be checked during the actual close operation
        if (!isSupport && !isAdmin) {
            // Only fetch ticket if we need to check customer permission
            const ticketService = getTicketService(interaction.client);
            const ticket = await ticketService.getTicketById(ticketId);

            if (!ticket) {
                await interaction.reply({
                    content: "Could not find ticket information.",
                    ephemeral: true,
                });
                return;
            }

            const isCustomer = ticket.customerDiscordId === interaction.user.id;

            if (!isCustomer) {
                await interaction.reply({
                    content: "You do not have permission to close this ticket.",
                    ephemeral: true,
                });
                return;
            }
        }

        // Show confirmation modal immediately
        const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

        const modal = new ModalBuilder()
            .setCustomId(`ticket_close_confirm_${ticketId}`)
            .setTitle("Close Ticket");

        const reasonInput = new TextInputBuilder()
            .setCustomId("close_reason")
            .setLabel("Reason for closing (Optional)")
            .setPlaceholder("Why are you closing this ticket?")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(500);

        const row = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(row);

        await interaction.showModal(modal as any);

        logger.info(
            `Close ticket modal opened for ticket ${ticketId} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling ticket close button:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "Failed to open close dialog. Please try again.",
                ephemeral: true,
            });
        }
    }
}
