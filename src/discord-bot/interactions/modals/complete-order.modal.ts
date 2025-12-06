import { ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordConfig } from "../../config/discord.config";
import axios from "axios";

/**
 * Handle order completion modal submission
 */
export async function handleCompleteOrderModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from customId: complete_order_{orderId}
        const orderId = interaction.customId.replace("complete_order_", "");

        // Get form inputs
        const confirmationText = interaction.fields.getTextInputValue("confirmation_text").trim().toUpperCase();
        const completionNotes = interaction.fields.getTextInputValue("completion_notes")?.trim() || null;

        // Validate confirmation
        if (confirmationText !== "COMPLETE") {
            await interaction.editReply({
                content: `❌ Invalid confirmation. You typed "${confirmationText}" but must type "COMPLETE" exactly.`,
            });
            return;
        }

        logger.info(`[CompleteOrder] Processing completion for order ${orderId} by worker ${interaction.user.id}`);

        // Create API client
        const apiClient = axios.create({
            baseURL: discordConfig.apiBaseUrl,
            timeout: 30000,
        });

        // Get order details
        const orderResponse = await apiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data.data || orderResponse.data;

        // Validate worker
        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the assigned worker for this order.",
            });
            return;
        }

        // Mark order as complete (AWAITING_CONFIRMATION)
        const completeResponse = await apiClient.put(`/discord/orders/${orderId}/complete`, {
            workerDiscordId: interaction.user.id,
            completionNotes,
        });

        const completedOrder = completeResponse.data.data || completeResponse.data;

        logger.info(`[CompleteOrder] Order ${orderId} marked as complete, awaiting customer confirmation`);

        // Calculate payout amounts
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8; // 80%
        const supportPayout = orderValue * 0.05; // 5%
        const systemPayout = orderValue * 0.15; // 15%

        // Send confirmation to worker
        const workerEmbed = new EmbedBuilder()
            .setTitle("✅ Order Marked as Complete")
            .setDescription(
                `You've successfully marked Order #${orderData.orderNumber} as complete!\n\n` +
                `The customer has been notified and will now review your work.`
            )
            .addFields([
                { name: "💰 Your Payout (pending)", value: `$${workerPayout.toFixed(2)} USD (80%)`, inline: true },
                { name: "📊 Status", value: "🟠 AWAITING CONFIRMATION", inline: true },
                { name: "⏳ Next Step", value: "Customer must confirm completion", inline: false },
            ])
            .setColor(0xf59e0b) // Orange for pending
            .setTimestamp();

        if (completionNotes) {
            workerEmbed.addFields([
                { name: "📝 Your Notes", value: completionNotes.substring(0, 1024), inline: false }
            ]);
        }

        await interaction.editReply({
            embeds: [workerEmbed.toJSON() as any],
        });

        // Send notification to customer in order channel
        const channel = interaction.channel;
        if (channel && channel instanceof TextChannel) {
            const customerEmbed = new EmbedBuilder()
                .setTitle("📦 ORDER COMPLETION NOTIFICATION")
                .setDescription(
                    `<@${orderData.customer.discordId}>, your order has been marked as complete!\n\n` +
                    `**Please verify the work and confirm completion.**`
                )
                .addFields([
                    { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                    { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                    { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                    { name: "📊 Status", value: "🟠 AWAITING YOUR CONFIRMATION", inline: false },
                ])
                .setColor(0xf59e0b)
                .setTimestamp();

            if (completionNotes) {
                customerEmbed.addFields([
                    { name: "📝 Completion Notes", value: completionNotes.substring(0, 1024), inline: false }
                ]);
            }

            customerEmbed.addFields([
                {
                    name: "ℹ️ Next Steps",
                    value:
                        "• Click **✅ Confirm Complete** if you're satisfied with the work\n" +
                        "• Click **❌ Report Issue** if there are problems",
                    inline: false,
                }
            ]);

            // Create confirmation buttons
            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_complete_${orderId}`)
                .setLabel("✅ Confirm Complete")
                .setStyle(ButtonStyle.Success);

            const issueButton = new ButtonBuilder()
                .setCustomId(`report_issue_${orderId}`)
                .setLabel("❌ Report Issue")
                .setStyle(ButtonStyle.Danger);

            const buttonRow = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(confirmButton, issueButton);

            await channel.send({
                content: `<@${orderData.customer.discordId}>`,
                embeds: [customerEmbed.toJSON() as any],
                components: [buttonRow.toJSON() as any],
            });

            logger.info(`[CompleteOrder] Sent confirmation request to customer in channel ${channel.id}`);
        }

        logger.info(`[CompleteOrder] Order ${orderId} completion flow initiated successfully`);
    } catch (error: any) {
        logger.error("[CompleteOrder] Error processing completion modal:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to mark order as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to mark order as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[CompleteOrder] Failed to send error message:", replyError);
        }
    }
}
