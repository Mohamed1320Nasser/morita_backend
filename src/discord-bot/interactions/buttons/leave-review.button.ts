import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

export async function handleLeaveReviewButton(interaction: ButtonInteraction): Promise<void> {
    try {
        // Determine review type (public or anonymous) and extract orderId
        let orderId: string;
        let isAnonymous = false;

        if (interaction.customId.startsWith("public_review_")) {
            orderId = interaction.customId.replace("public_review_", "");
            isAnonymous = false;
        } else if (interaction.customId.startsWith("anonymous_review_")) {
            orderId = interaction.customId.replace("anonymous_review_", "");
            isAnonymous = true;
        } else {
            // Legacy support for old leave_review_ prefix
            orderId = interaction.customId.replace("leave_review_", "");
            isAnonymous = false;
        }

        logger.info(`[LeaveReview] Customer ${interaction.user.id} requesting ${isAnonymous ? 'anonymous' : 'public'} review modal for order ${orderId}`);

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.reply({
                content: "❌ You are not the customer for this order.",
                ephemeral: true,
            });
            return;
        }

        if (orderData.rating || orderData.review) {
            await interaction.reply({
                content: `ℹ️ You already reviewed this order!\n\n` +
                    `**Your Rating:** ${orderData.rating ? '⭐'.repeat(orderData.rating) : 'Not rated'}\n` +
                    `**Your Review:** ${orderData.review || 'No review'}`,
                ephemeral: true,
            });
            return;
        }

        // Include anonymous flag in customId: order_review_anon_<orderId> or order_review_public_<orderId>
        const reviewType = isAnonymous ? 'anon' : 'public';
        const reviewModal = new ModalBuilder()
            .setCustomId(`order_review_${reviewType}_${orderId}`)
            .setTitle(`${isAnonymous ? 'Anonymous' : 'Public'} Review #${orderData.orderNumber}`);

        const ratingInput = new TextInputBuilder()
            .setCustomId('rating')
            .setLabel('Rating (1-5 stars) ⭐')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter 1, 2, 3, 4, or 5')
            .setMinLength(1)
            .setMaxLength(1)
            .setRequired(true);

        const reviewInput = new TextInputBuilder()
            .setCustomId('review')
            .setLabel('Your Review (Optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Tell us about your experience with this order...\n\nWhat did you like? What could be improved?')
            .setMaxLength(1000)
            .setRequired(false);

        const ratingRow = new ActionRowBuilder<TextInputBuilder>().addComponents(ratingInput);
        const reviewRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reviewInput);

        reviewModal.addComponents(ratingRow, reviewRow);

        await interaction.showModal(reviewModal.toJSON() as any);

        logger.info(`[LeaveReview] Showed ${isAnonymous ? 'anonymous' : 'public'} review modal to customer for order ${orderId}`);
    } catch (error: any) {
        logger.error("[LeaveReview] Error showing review modal:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to show review form**\n\n${errorMessage}`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to show review form**\n\n${errorMessage}`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[LeaveReview] Failed to send error message:", replyError);
        }
    }
}
