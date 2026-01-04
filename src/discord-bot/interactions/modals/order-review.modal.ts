import { ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { getReviewsChannelService } from "../../services/reviews-channel.service";

/**
 * Handle order review modal submission
 */
export async function handleOrderReviewModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from customId: order_review_{orderId}
        const orderId = interaction.customId.replace("order_review_", "");

        // Get form inputs
        const ratingStr = interaction.fields.getTextInputValue("rating").trim();
        const review = interaction.fields.getTextInputValue("review")?.trim() || null;

        // Validate rating (1-5)
        const rating = parseInt(ratingStr);
        if (isNaN(rating) || rating < 1 || rating > 5) {
            await interaction.editReply({
                content: `❌ Invalid rating. Please enter a number between 1 and 5.\n\nYou entered: "${ratingStr}"`,
            });
            return;
        }

        logger.info(`[OrderReview] Processing review for order ${orderId} - Rating: ${rating} stars`);

        // Get order details
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        // Validate customer
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        // Submit review to backend
        const reviewResponse: any = await discordApiClient.put(`/discord/orders/${orderId}/review`, {
            customerDiscordId: interaction.user.id,
            rating,
            review,
        });

        logger.info(`[OrderReview] Review submitted for order ${orderId}`);

        // Post to Reviews Channel
        try {
            const reviewsService = getReviewsChannelService(interaction.client);
            const customerUser = interaction.user;
            const workerUser = await interaction.client.users.fetch(orderData.worker.discordId);

            const reviewData = {
                rating,
                comment: review,
                createdAt: new Date(),
            };

            await reviewsService.postReview(
                orderData,
                reviewData,
                customerUser,
                workerUser
            );

            logger.info(`[OrderReview] Posted review for order ${orderId} to reviews channel`);
        } catch (reviewChannelError) {
            logger.error(`[OrderReview] Failed to post to reviews channel:`, reviewChannelError);
            // Don't fail the whole operation if channel posting fails
        }

        // Create star display
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);

        // Send thank you message to customer
        const thankYouEmbed = new EmbedBuilder()
            .setTitle("✅ Thank You for Your Review!")
            .setDescription(
                `Your feedback has been recorded for Order #${orderData.orderNumber}.\n\n` +
                `We appreciate you taking the time to share your experience!`
            )
            .addFields([
                { name: "⭐ Your Rating", value: `${stars} (${rating}/5)`, inline: false },
            ])
            .setColor(0x57f287)
            .setTimestamp()
            .setFooter({ text: "Thank you for your business!" });

        if (review) {
            thankYouEmbed.addFields([
                { name: "📝 Your Review", value: review.substring(0, 1024), inline: false }
            ]);
        }

        thankYouEmbed.addFields([
            {
                name: "💡 Next Steps",
                value: "Use `/close-ticket` when you're ready to close this ticket.",
                inline: false
            }
        ]);

        await interaction.editReply({
            embeds: [thankYouEmbed.toJSON() as any],
        });

        // Post review notification in channel
        const channel = interaction.channel;
        if (channel && 'send' in channel) {
            try {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(
                                `⭐ **Customer left a ${rating}-star review!**\n\n` +
                                `${review || '_No written review provided_'}`
                            )
                            .setColor(rating >= 4 ? 0x57f287 : rating >= 3 ? 0xf59e0b : 0xe74c3c)
                            .toJSON() as any
                    ]
                });
            } catch (channelError) {
                logger.warn(`[OrderReview] Could not post review in channel:`, channelError);
                // Don't fail if channel post fails
            }
        }

        logger.info(`[OrderReview] Order ${orderId} review flow completed`);
    } catch (error: any) {
        logger.error("[OrderReview] Error processing review:", error);

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
            logger.error("[OrderReview] Failed to send error message:", replyError);
        }
    }
}
