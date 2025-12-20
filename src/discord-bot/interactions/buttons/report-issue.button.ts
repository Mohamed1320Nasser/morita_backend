import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";

/**
 * Handle "Report Issue" button click (customer reports problem with order)
 */
export async function handleReportIssueButton(interaction: ButtonInteraction): Promise<void> {
    try {
        // Extract orderId from button customId: report_issue_{orderId}
        const orderId = interaction.customId.replace("report_issue_", "");

        logger.info(`[ReportIssue] Customer ${interaction.user.id} reporting issue for order ${orderId}`);

        // Get order details first
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        // HttpClient interceptor already unwrapped one level
        const orderData = orderResponse.data || orderResponse;

        // Validate customer is the one who placed this order
        if (!orderData.customer || orderData.customer.discordId !== interaction.user.id) {
            await interaction.reply({
                content: "❌ You are not the customer for this order.",
                ephemeral: true,
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "AWAITING_CONFIRMATION" && orderData.status !== "AWAITING_CONFIRM") {
            await interaction.reply({
                content: `❌ Cannot report issue. Current status: ${orderData.status}`,
                ephemeral: true,
            });
            return;
        }

        // Create issue report modal
        const modal = new ModalBuilder()
            .setCustomId(`report_issue_${orderId}`)
            .setTitle("❌ Report Order Issue");

        const issueDescriptionInput = new TextInputBuilder()
            .setCustomId("issue_description")
            .setLabel("Describe the issue")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Please describe what's wrong with the order...")
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000);

        const row = new ActionRowBuilder<TextInputBuilder>().addComponents(issueDescriptionInput);

        modal.addComponents(row);

        // Show modal
        await interaction.showModal(modal as any);

        logger.info(`[ReportIssue] Showed issue report modal for order ${orderId}`);
    } catch (error: any) {
        logger.error("[ReportIssue] Error showing issue report modal:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Failed to show issue report form: ${error.message || "Unknown error"}`,
                ephemeral: true,
            });
        }
    }
}
