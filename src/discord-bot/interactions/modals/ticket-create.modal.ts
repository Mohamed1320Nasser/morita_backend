import { ModalSubmitInteraction, TextChannel, Guild, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder as DiscordEmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService, TicketData } from "../../services/ticket.service";
import { discordConfig } from "../../config/discord.config";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle the ticket creation modal submission
 * Creates a new ticket channel and sends the welcome message
 */
export async function handleTicketCreateModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        // Defer the reply as channel creation takes time
        await interaction.deferReply({ ephemeral: true });

        // Parse the custom ID to get service and category info
        // Format: ticket_create_modal_<serviceId>_<categoryId>_<price>
        const customIdParts = interaction.customId.split("_");
        const serviceId =
            customIdParts[3] !== "general" ? customIdParts[3] : undefined;
        let categoryId =
            customIdParts[4] !== "general" ? customIdParts[4] : undefined;
        const calculatedPrice =
            customIdParts[5] && customIdParts[5] !== "0"
                ? parseFloat(customIdParts[5])
                : undefined;

        // Get form inputs
        const description = interaction.fields.getTextInputValue(
            "ticket_description"
        );
        const osrsUsername =
            interaction.fields.getTextInputValue("ticket_osrs_username") ||
            undefined;
        const contactPreference =
            interaction.fields.getTextInputValue("ticket_contact") || undefined;

        // Get the guild
        const guild = interaction.guild;
        if (!guild) {
            await interaction.editReply({
                content: "This command can only be used in a server.",
            });
            return;
        }

        // If no category ID, try to get it from the service
        if (!categoryId && serviceId) {
            try {
                const serviceResponse: any = await discordApiClient.get(
                    `/api/public/services/${serviceId}/pricing`
                );
                // HttpClient interceptor already unwrapped response.data
                if (serviceResponse.success && serviceResponse.data) {
                    categoryId = serviceResponse.data.categoryId;
                }
            } catch (error) {
                logger.warn(
                    `Could not fetch service info for ${serviceId}:`,
                    error
                );
            }
        }

        // If still no category, use a default
        if (!categoryId) {
            // Get the first active category as default
            try {
                const categoriesResponse: any = await discordApiClient.get(
                    "/api/public/service-categories"
                );
                // HttpClient interceptor already unwrapped response.data
                if (
                    categoriesResponse.data?.success &&
                    categoriesResponse.data.data?.length > 0
                ) {
                    categoryId = categoriesResponse.data.data[0].id;
                }
            } catch (error) {
                logger.error("Could not fetch default category:", error);
                await interaction.editReply({
                    content:
                        "Failed to create ticket. No categories available.",
                });
                return;
            }
        }

        if (!categoryId) {
            await interaction.editReply({
                content:
                    "Failed to create ticket. Please contact support directly.",
            });
            return;
        }

        // Build customer notes
        const notesParts: string[] = [];
        if (description) {
            notesParts.push(`Request: ${description}`);
        }
        if (osrsUsername) {
            notesParts.push(`OSRS Username: ${osrsUsername}`);
        }
        if (contactPreference) {
            notesParts.push(`Contact: ${contactPreference}`);
        }
        const customerNotes = notesParts.join("\n");

        // Prepare ticket data
        const ticketData: TicketData = {
            customerDiscordId: interaction.user.id,
            categoryId,
            serviceId,
            calculatedPrice,
            customerNotes,
            customerName: interaction.user.displayName || interaction.user.username,
        };

        // Get the ticket service and create the ticket
        const ticketService = getTicketService(interaction.client);

        logger.info(
            `Creating ticket for ${interaction.user.tag} in category ${categoryId}`
        );

        const { channel, ticket } = await ticketService.createTicketChannel(
            guild,
            interaction.user,
            ticketData
        );

        // Send the welcome message
        await ticketService.sendWelcomeMessage(
            channel as TextChannel,
            ticket,
            interaction.user
        );

        // Reply to user with embed
        const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");
        const successEmbed = new DiscordEmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Ticket Created Successfully!")
            .setDescription(`Your ticket has been created and is ready for our team to assist you.`)
            .addFields(
                { name: "📋 Ticket Number", value: `#${ticketNumber}`, inline: true },
                { name: "🎮 Service Type", value: "Support Ticket", inline: true },
                { name: "📍 Ticket Channel", value: `Head to <#${channel.id}> to continue.`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: "Our support team will respond shortly" });

        await interaction.editReply({
            embeds: [successEmbed as any],
        });

        logger.info(
            `Ticket #${ticketNumber} created for ${interaction.user.tag} in channel ${channel.name}`
        );
    } catch (error) {
        logger.error("Error handling ticket create modal:", error);

        try {
            await interaction.editReply({
                content:
                    "Failed to create ticket. Please try again or contact support directly.",
            });
        } catch (e) {
            logger.error("Failed to send error message:", e);
        }
    }
}

/**
 * Handle the ticket close confirmation modal
 */
export async function handleTicketCloseConfirmModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Get ticket ID from custom ID
        const ticketId = interaction.customId.replace(
            "ticket_close_confirm_",
            ""
        );

        // Get the reason
        const reason =
            interaction.fields.getTextInputValue("close_reason") || undefined;

        // Get the ticket service
        const ticketService = getTicketService(interaction.client);

        // Get ticket to check permissions and order status
        const ticket = await ticketService.getTicketById(ticketId);

        if (!ticket) {
            await interaction.editReply({
                content: "Could not find ticket information.",
            });
            return;
        }

        // Check permissions
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

        // Check if ticket has an associated order
        let associatedOrder = null;
        try {
            const orderResponse = await discordApiClient.get(
                `/discord/orders/by-ticket/${ticketId}`
            );
            associatedOrder = orderResponse.data?.data || orderResponse.data;
        } catch (error: any) {
            // No order found - that's okay
            if (error?.response?.status !== 404) {
                logger.warn(`Error fetching order for ticket ${ticketId}:`, error);
            }
        }

        // CUSTOMER RESTRICTIONS
        if (isCustomer && !isSupport && !isAdmin) {
            // Customer can ONLY close if NO order exists
            if (associatedOrder) {
                const orderStatus = associatedOrder.status;

                await interaction.editReply({
                    content:
                        `❌ **Cannot Close Ticket**\n\n` +
                        `You cannot close this ticket because an order exists.\n\n` +
                        `**Order #${associatedOrder.orderNumber}**\n` +
                        `**Status:** ${orderStatus}\n` +
                        `**Worker:** ${associatedOrder.workerDiscordId ? `<@${associatedOrder.workerDiscordId}>` : 'Unassigned'}\n\n` +
                        `Please contact support if you need to close this ticket.`,
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

                // Create confirmation button with ticket ID and reason encoded
                const confirmButton = new ButtonBuilder()
                    .setCustomId(`confirm_close_ticket_${ticketId}_${reason || 'none'}`)
                    .setLabel("Confirm Close Ticket")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Danger);

                const cancelButton = new ButtonBuilder()
                    .setCustomId(`cancel_close_ticket_${ticketId}`)
                    .setLabel("Cancel")
                    .setEmoji("❌")
                    .setStyle(ButtonStyle.Secondary);

                const actionRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(confirmButton, cancelButton);

                await interaction.editReply({
                    content:
                        `${warningTitle}\n\n${warningDescription}`,
                    components: [actionRow as any],
                });
                return;
            }
        }

        // Close the ticket (no confirmation needed - safe to close)
        await ticketService.closeTicket(ticketId, interaction.user, reason);

        await interaction.deleteReply();

        logger.info(
            `Ticket ${ticketId} closed by ${interaction.user.tag}${reason ? `: ${reason}` : ""}${associatedOrder ? ` | Order #${associatedOrder.orderNumber} status: ${associatedOrder.status}` : ""}`
        );
    } catch (error) {
        logger.error("Error handling ticket close confirm modal:", error);

        try {
            await interaction.editReply({
                content: "Failed to close ticket. Please try again.",
            });
        } catch (e) {
            logger.error("Failed to send error message:", e);
        }
    }
}
