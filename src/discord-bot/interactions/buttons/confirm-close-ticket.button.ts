import { ButtonInteraction } from "discord.js";
import { getTicketService } from "../../services/ticket.service";
import logger from "../../../common/loggers";

/**
 * Handle confirmation of ticket closure (Support/Admin only)
 * Called when Support/Admin confirms they want to close a ticket with an active order
 */
export async function handleConfirmCloseTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        // Parse ticket ID and reason from custom ID
        // Format: confirm_close_ticket_<ticketId>_<reason>
        const parts = interaction.customId.split("_");
        const ticketId = parts[3]; // confirm_close_ticket_<ticketId>_<reason>
        const reason = parts.slice(4).join("_"); // Rejoin in case reason has underscores
        const actualReason = reason === "none" ? undefined : reason;

        logger.info(`[ConfirmCloseTicket] Admin/Support confirmed close for ticket ${ticketId}`);

        // Get ticket service
        const ticketService = getTicketService(interaction.client);

        // Close the ticket
        await ticketService.closeTicket(ticketId, interaction.user, actualReason);

        // Update the message to show success
        await interaction.editReply({
            content: `✅ **Ticket Closed**\n\nThe ticket has been closed by <@${interaction.user.id}>. The channel will be archived shortly.`,
            components: [], // Remove buttons
        });

        logger.info(
            `Ticket ${ticketId} closed by ${interaction.user.tag} (confirmed)${actualReason ? `: ${actualReason}` : ""}`
        );
    } catch (error) {
        logger.error("Error handling confirm close ticket button:", error);

        try {
            await interaction.editReply({
                content: `❌ **Error**\n\nFailed to close ticket. Please try again or contact an administrator.`,
                components: [],
            });
        } catch (e) {
            logger.error("Failed to send error message:", e);
        }
    }
}

/**
 * Handle cancellation of ticket closure
 * Called when Support/Admin cancels the close action
 */
export async function handleCancelCloseTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        logger.info(`[CancelCloseTicket] Admin/Support cancelled ticket close action`);

        // Update the message to show cancellation
        await interaction.editReply({
            content: `❌ **Cancelled**\n\nTicket closure has been cancelled. The ticket remains open.`,
            components: [], // Remove buttons
        });
    } catch (error) {
        logger.error("Error handling cancel close ticket button:", error);

        try {
            await interaction.editReply({
                content: `⚠️ Action cancelled.`,
                components: [],
            });
        } catch (e) {
            logger.error("Failed to send error message:", e);
        }
    }
}
