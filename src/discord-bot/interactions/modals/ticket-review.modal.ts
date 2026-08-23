import { ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { getReviewsChannelService } from "../../services/reviews-channel.service";
import { getTicketTypeLabel } from "../../utils/ticketTypeHelper";

export async function handleTicketReviewModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const isAnonymous = interaction.customId.startsWith("ticket_review_anon_");
        const ticketId = interaction.customId
            .replace("ticket_review_anon_", "")
            .replace("ticket_review_public_", "");

        const ratingStr = interaction.fields.getTextInputValue("rating").trim();
        const comment = interaction.fields.getTextInputValue("review")?.trim() || null;

        const rating = parseInt(ratingStr, 10);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            await interaction.editReply({
                content: `❌ Invalid rating. Please enter a number between 1 and 5.\n\nYou entered: "${ratingStr}"`,
            });
            return;
        }

        const response: any = await discordApiClient.get(`/discord/tickets/${ticketId}`);
        const ticket = response?.data?.data || response?.data || response;

        if (!ticket?.id) {
            await interaction.editReply({ content: "❌ This ticket could not be found." });
            return;
        }

        await discordApiClient.put(`/discord/tickets/${ticketId}/review`, {
            customerDiscordId: interaction.user.id,
            rating,
            review: comment,
        });

        logger.info(`[TicketReview] Review saved for ticket ${ticketId} (${rating}/5)`);

        try {
            const reviews = getReviewsChannelService(interaction.client);
            await reviews.postTicketReview(
                ticket,
                {
                    rating,
                    comment,
                    label: getTicketTypeLabel(ticket.ticketType),
                    createdAt: new Date(),
                },
                interaction.user,
                isAnonymous
            );
        } catch (channelError) {
            // The review is already saved; failing to post it publicly should
            // not look like a failure to the customer.
            logger.error("[TicketReview] Failed to post to reviews channel:", channelError);
        }

        const stars = "⭐".repeat(rating) + "☆".repeat(5 - rating);

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Thank You for Your Feedback!")
                    .setDescription(
                        `Your review has been recorded for Ticket #${ticket.ticketNumber}.\n\n` +
                        `We appreciate you taking the time to share your experience!`
                    )
                    .addFields([{ name: "⭐ Your Rating", value: `${stars} (${rating}/5)` }])
                    .setColor(0x57f287)
                    .setTimestamp()
                    .toJSON() as any,
            ],
        });
    } catch (error: any) {
        logger.error("[TicketReview] Error handling review modal:", error);

        const message =
            error?.response?.data?.msg ||
            error?.response?.data?.message ||
            "Something went wrong saving your review. Please try again later.";

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: `❌ ${message}` });
        }
    }
}
