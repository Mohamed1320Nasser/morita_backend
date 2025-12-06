import { ModalSubmitInteraction, TextChannel, Guild } from "discord.js";
import logger from "../../../common/loggers";
import { getTicketService, TicketData } from "../../services/ticket.service";
import { discordConfig } from "../../config/discord.config";
import axios from "axios";

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
                const apiClient = axios.create({
                    baseURL: discordConfig.apiBaseUrl,
                    timeout: 10000,
                });
                const serviceResponse = await apiClient.get(
                    `/api/public/services/${serviceId}/pricing`
                );
                if (serviceResponse.data.success && serviceResponse.data.data) {
                    categoryId = serviceResponse.data.data.categoryId;
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
                const apiClient = axios.create({
                    baseURL: discordConfig.apiBaseUrl,
                    timeout: 10000,
                });
                const categoriesResponse = await apiClient.get(
                    "/api/public/service-categories"
                );
                if (
                    categoriesResponse.data.data?.success &&
                    categoriesResponse.data.data.data?.length > 0
                ) {
                    categoryId = categoriesResponse.data.data.data[0].id;
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

        // Reply to the user
        const ticketNumber = ticket.ticketNumber.toString().padStart(4, "0");
        await interaction.editReply({
            content: `Your ticket has been created! Head to <#${channel.id}> to continue.\n\n**Ticket #${ticketNumber}**`,
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

        // Close the ticket
        await ticketService.closeTicket(ticketId, interaction.user, reason);

        await interaction.editReply({
            content:
                "Ticket has been closed. The channel will be archived shortly.",
        });

        logger.info(
            `Ticket ${ticketId} closed by ${interaction.user.tag}${reason ? `: ${reason}` : ""}`
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
