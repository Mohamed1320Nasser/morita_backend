import { ButtonInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import axios from "axios";
import { discordConfig } from "../../config/discord.config";

/**
 * Handle "Confirm Complete" button click (customer confirms order completion)
 */
export async function handleConfirmCompleteButton(interaction: ButtonInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract orderId from button customId: confirm_complete_{orderId}
        const orderId = interaction.customId.replace("confirm_complete_", "");

        logger.info(`[ConfirmComplete] Customer ${interaction.user.id} confirming order ${orderId}`);

        // Create API client
        const apiClient = axios.create({
            baseURL: discordConfig.apiBaseUrl,
            timeout: 30000,
        });

        // Get order details first
        const orderResponse = await apiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data.data || orderResponse.data;

        // Validate customer is the one who placed this order
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.editReply({
                content: "❌ You are not the customer for this order.",
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "AWAITING_CONFIRMATION" && orderData.status !== "AWAITING_CONFIRM") {
            await interaction.editReply({
                content: `❌ Order cannot be confirmed. Current status: ${orderData.status}`,
            });
            return;
        }

        // Confirm order completion (triggers payout)
        const confirmResponse = await apiClient.put(`/discord/orders/${orderId}/confirm`, {
            customerDiscordId: interaction.user.id,
        });

        const confirmedOrder = confirmResponse.data.data || confirmResponse.data;

        logger.info(`[ConfirmComplete] Order ${orderId} confirmed, payouts triggered`);

        // Calculate payout amounts for display
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8; // 80%
        const supportPayout = orderValue * 0.05; // 5%
        const systemPayout = orderValue * 0.15; // 15%

        // Send confirmation to customer
        const customerEmbed = new EmbedBuilder()
            .setTitle("✅ Order Confirmed!")
            .setDescription(
                `Thank you for confirming completion of Order #${orderData.orderNumber}!\n\n` +
                `Payouts have been automatically distributed.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "💰 Order Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                { name: "📊 Status", value: "✅ COMPLETED", inline: true },
                {
                    name: "💸 Payout Distribution",
                    value:
                        `• 👷 Worker: $${workerPayout.toFixed(2)} (80%)\n` +
                        `• 🎧 Support: $${supportPayout.toFixed(2)} (5%)\n` +
                        `• 🏢 System: $${systemPayout.toFixed(2)} (15%)`,
                    inline: false,
                },
            ])
            .setColor(0x57f287) // Green for success
            .setTimestamp()
            .setFooter({ text: "Thank you for your business!" });

        await interaction.editReply({
            embeds: [customerEmbed.toJSON() as any],
        });

        // Send notification to order channel
        const channel = interaction.channel;
        if (channel && channel instanceof TextChannel) {
            const completionEmbed = new EmbedBuilder()
                .setTitle("✅ ORDER COMPLETED")
                .setDescription(
                    `Order #${orderData.orderNumber} has been confirmed as complete!\n\n` +
                    `Payouts have been distributed automatically.`
                )
                .addFields([
                    { name: "👤 Customer", value: `<@${orderData.customer.discordId}>`, inline: true },
                    { name: "👷 Worker", value: `<@${orderData.worker.discordId}>`, inline: true },
                    { name: "💰 Total Value", value: `$${orderValue.toFixed(2)} USD`, inline: true },
                    {
                        name: "💸 Payouts Processed",
                        value:
                            `✅ Worker received $${workerPayout.toFixed(2)} USD\n` +
                            `✅ Support received $${supportPayout.toFixed(2)} USD\n` +
                            `✅ System collected $${systemPayout.toFixed(2)} USD`,
                        inline: false,
                    },
                ])
                .setColor(0x57f287)
                .setTimestamp()
                .setFooter({ text: `Order #${orderData.orderNumber} • Completed` });

            if (orderData.completionNotes) {
                completionEmbed.addFields([
                    { name: "📝 Completion Notes", value: orderData.completionNotes.substring(0, 1024), inline: false }
                ]);
            }

            // Disable the buttons by editing the original message
            try {
                // Find and edit the confirmation message to disable buttons
                const messages = await channel.messages.fetch({ limit: 10 });
                const confirmationMessage = messages.find(msg =>
                    msg.content.includes(`<@${orderData.customer.discordId}>`) &&
                    msg.embeds.length > 0 &&
                    msg.embeds[0].title === "📦 ORDER COMPLETION NOTIFICATION"
                );

                if (confirmationMessage) {
                    await confirmationMessage.edit({
                        components: [], // Remove all buttons
                    });
                }
            } catch (err) {
                logger.warn(`[ConfirmComplete] Could not disable buttons on confirmation message:`, err);
            }

            await channel.send({
                embeds: [completionEmbed.toJSON() as any],
            });

            logger.info(`[ConfirmComplete] Sent completion notification to channel ${channel.id}`);
        }

        logger.info(`[ConfirmComplete] Order ${orderId} completion flow finished successfully`);
    } catch (error: any) {
        logger.error("[ConfirmComplete] Error confirming order completion:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to confirm order**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ConfirmComplete] Failed to send error message:", replyError);
        }
    }
}
