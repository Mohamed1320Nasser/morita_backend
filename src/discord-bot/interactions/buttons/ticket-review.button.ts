import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

export async function handleTicketReviewButton(interaction: ButtonInteraction): Promise<void> {
    try {
        const isAnonymous = interaction.customId.startsWith("ticket_review_anon_");
        const ticketId = interaction.customId
            .replace("ticket_review_anon_", "")
            .replace("ticket_review_public_", "");

        const response: any = await discordApiClient.get(`/discord/tickets/${ticketId}`);
        const ticket = response?.data?.data || response?.data || response;

        if (!ticket?.id) {
            await interaction.reply({
                content: "❌ This ticket could not be found.",
                ephemeral: true,
            });
            return;
        }

        const customerDiscordId = ticket.customer?.discordId || ticket.customerDiscordId;
        if (customerDiscordId !== interaction.user.id) {
            await interaction.reply({
                content: "❌ You are not the customer for this ticket.",
                ephemeral: true,
            });
            return;
        }

        if (ticket.rating || ticket.review) {
            await interaction.reply({
                content:
                    `ℹ️ You already reviewed this ticket.\n\n` +
                    `**Your Rating:** ${ticket.rating ? "⭐".repeat(ticket.rating) : "Not rated"}\n` +
                    `**Your Review:** ${ticket.review || "No comment"}`,
                ephemeral: true,
            });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`ticket_review_${isAnonymous ? "anon" : "public"}_${ticketId}`)
            .setTitle(`${isAnonymous ? "Anonymous" : "Public"} Review #${ticket.ticketNumber}`);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("rating")
                    .setLabel("Rating (1-5 stars) ⭐")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("Enter 1, 2, 3, 4, or 5")
                    .setMinLength(1)
                    .setMaxLength(1)
                    .setRequired(true)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("review")
                    .setLabel("Your feedback (optional)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder("How did it go? Anything we could do better?")
                    .setMaxLength(500)
                    .setRequired(false)
            )
        );

        await interaction.showModal(modal.toJSON() as any);
        logger.info(`[TicketReview] Modal shown for ticket ${ticketId}`);
    } catch (error) {
        logger.error("[TicketReview] Error showing review modal:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "❌ Something went wrong. Please try again later.",
                ephemeral: true,
            });
        }
    }
}
