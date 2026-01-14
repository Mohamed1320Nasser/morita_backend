import { ButtonInteraction } from "discord.js";
import { getTicketService } from "../../services/ticket.service";
import logger from "../../../common/loggers";

export async function handleConfirmCloseTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        const parts = interaction.customId.split("_");
        const ticketId = parts[3]; 
        const reason = parts.slice(4).join("_"); 
        const actualReason = reason === "none" ? undefined : reason;

        logger.info(`[ConfirmCloseTicket] Admin/Support confirmed close for ticket ${ticketId}`);

        const ticketService = getTicketService(interaction.client);

        await ticketService.closeTicket(ticketId, interaction.user, actualReason);

        await interaction.editReply({
            content: `✅ **Ticket Closed**\n\nThe ticket has been closed by <@${interaction.user.id}>. The channel will be archived shortly.`,
            components: [], 
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

export async function handleCancelCloseTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferUpdate();

        logger.info(`[CancelCloseTicket] Admin/Support cancelled ticket close action`);

        await interaction.editReply({
            content: `❌ **Cancelled**\n\nTicket closure has been cancelled. The ticket remains open.`,
            components: [], 
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
