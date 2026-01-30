import { ModalSubmitInteraction, EmbedBuilder, ColorResolvable } from "discord.js";
import logger from "../../../common/loggers";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import { getReviewsChannelService } from "../../services/reviews-channel.service";

const apiService = new ApiService(discordConfig.apiBaseUrl);

/**
 * Handle the account review modal submission
 * Modal ID format: account_review_public_TICKETID or account_review_anon_TICKETID
 */
export async function handleAccountReviewModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        let ticketId: string;
        let isAnonymous = false;

        if (customId.startsWith("account_review_anon_")) {
            ticketId = customId.replace("account_review_anon_", "");
            isAnonymous = true;
        } else if (customId.startsWith("account_review_public_")) {
            ticketId = customId.replace("account_review_public_", "");
            isAnonymous = false;
        } else {
            ticketId = customId.replace("account_review_", "");
            isAnonymous = false;
        }

        // Get form values
        const ratingStr = interaction.fields.getTextInputValue("rating").trim();
        const review = interaction.fields.getTextInputValue("review")?.trim() || null;

        // Validate rating
        const rating = parseInt(ratingStr);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            await interaction.editReply({
                content: `❌ Invalid rating. Please enter a number between 1 and 5.\n\nYou entered: "${ratingStr}"`,
            });
            return;
        }

        logger.info(`[AccountReview] Processing ${isAnonymous ? 'anonymous' : 'public'} review for ticket ${ticketId} - Rating: ${rating} stars`);

        // Get ticket data for context
        let ticketData: any = null;
        try {
            ticketData = await apiService.getTicketById(ticketId);
        } catch (err) {
            logger.warn(`[AccountReview] Could not fetch ticket data: ${err}`);
        }

        // Post to reviews channel
        try {
            const reviewsService = getReviewsChannelService(interaction.client);
            const customerUser = interaction.user;

            // Create review data for the reviews channel
            const reviewData = {
                rating,
                comment: review,
                createdAt: new Date(),
                isAnonymous,
            };

            // Create a pseudo order data for the reviews service
            const orderData = {
                orderNumber: ticketData?.ticketNumber || ticketId.slice(0, 8),
                service: {
                    name: ticketData?.accountName || "Account Purchase",
                },
                customer: {
                    discordId: interaction.user.id,
                },
                worker: null, // Account sales don't have a worker
            };

            // Post review without worker (staff handled it)
            await reviewsService.postAccountReview(
                orderData,
                reviewData,
                customerUser,
                isAnonymous
            );

            logger.info(`[AccountReview] Posted review for ticket ${ticketId} to reviews channel`);
        } catch (reviewChannelError) {
            logger.error(`[AccountReview] Failed to post to reviews channel:`, reviewChannelError);
        }

        // Create thank you embed
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

        const thankYouEmbed = new EmbedBuilder()
            .setTitle("✅ Thank You for Your Review!")
            .setDescription(
                `Your feedback has been recorded.\n\n` +
                `We appreciate you taking the time to share your experience!`
            )
            .addFields([
                { name: "⭐ Your Rating", value: `${stars} (${rating}/5)`, inline: false },
            ])
            .setColor(0x57f287 as ColorResolvable)
            .setTimestamp()
            .setFooter({ text: "MORITA Gaming • Thank you for your purchase!" });

        if (review) {
            thankYouEmbed.addFields([
                { name: "📝 Your Review", value: review.substring(0, 1024), inline: false }
            ]);
        }

        await interaction.editReply({
            embeds: [thankYouEmbed as any],
        });

        // Post review notification in channel
        const channel = interaction.channel;
        if (channel && 'send' in channel) {
            try {
                const reviewEmbed = new EmbedBuilder()
                    .setDescription(
                        `⭐ **Customer left a ${rating}-star review!**\n\n` +
                        `${review || '_No written review provided_'}`
                    )
                    .setColor(
                        rating >= 4 ? 0x57f287 : rating >= 3 ? 0xf59e0b : 0xe74c3c
                    )
                    .setTimestamp();

                await channel.send({
                    embeds: [reviewEmbed as any],
                });
            } catch (channelError) {
                logger.warn(`[AccountReview] Could not post review in channel:`, channelError);
            }
        }

        logger.info(`[AccountReview] Ticket ${ticketId} review flow completed`);
    } catch (error: any) {
        logger.error("[AccountReview] Error processing review:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to submit review**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to submit review**\n\n${errorMessage}`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[AccountReview] Failed to send error message:", replyError);
        }
    }
}
