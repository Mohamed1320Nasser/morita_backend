import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { isAdminOrSupport } from "../../utils/role-check.util";

export async function handleResolveIssueButton(interaction: ButtonInteraction): Promise<void> {
    try {
        const customId = interaction.customId;

        // Parse: resolve_approve_work_{issueId}_{orderId}, resolve_corrections_{issueId}_{orderId}, resolve_refund_{issueId}_{orderId}
        const parts = customId.split("_");
        const resolutionType = parts.slice(1, -2).join("_"); // Everything between "resolve_" and last two parts
        const issueId = parts[parts.length - 2];
        const orderId = parts[parts.length - 1];

        logger.info(`[ResolveIssue] Resolution type: ${resolutionType}, Issue: ${issueId}, Order: ${orderId}`);

        // Validate user has admin or support role
        const hasPermission = await isAdminOrSupport(interaction.client, interaction.user.id);
        if (!hasPermission) {
            await interaction.reply({
                content: `❌ **Permission Denied**\n\nOnly users with Admin or Support roles can resolve issues.\n\nPlease contact an administrator.`,
                ephemeral: true,
            });
            logger.warn(`[ResolveIssue] User ${interaction.user.tag} (${interaction.user.id}) attempted to access resolution modal without permission`);
            return;
        }

        const issueResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = issueResponse.data || issueResponse;

        if (resolutionType === "approve_work") {
            await showApproveWorkCompleteModal(interaction, issueId, orderId, orderData);
        } else if (resolutionType === "corrections") {
            await showRequestCorrectionsModal(interaction, issueId, orderId, orderData);
        } else if (resolutionType === "refund") {
            await showApproveCustomerRefundModal(interaction, issueId, orderId, orderData);
        }
    } catch (error: any) {
        logger.error("[ResolveIssue] Error showing resolution modal:", error);

        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: `❌ Failed to show resolution form: ${error.message || "Unknown error"}`,
                ephemeral: true,
            });
        }
    }
}

async function showApproveWorkCompleteModal(
    interaction: ButtonInteraction,
    issueId: string,
    orderId: string,
    orderData: any
): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId(`resolve_approve_work_modal_${issueId}_${orderId}`)
        .setTitle("✅ Approve Work - Complete Order");

    const notesInput = new TextInputBuilder()
        .setCustomId("resolution_notes")
        .setLabel("Resolution Notes")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Explain why the worker was right and order is being completed...")
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000);

    const confirmInput = new TextInputBuilder()
        .setCustomId("confirmation")
        .setLabel("Type COMPLETE to confirm (case-insensitive)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Type: COMPLETE")
        .setRequired(true)
        .setMinLength(8)
        .setMaxLength(8);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(confirmInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
    );

    await interaction.showModal(modal as any);
}

async function showRequestCorrectionsModal(
    interaction: ButtonInteraction,
    issueId: string,
    orderId: string,
    orderData: any
): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId(`resolve_corrections_modal_${issueId}_${orderId}`)
        .setTitle("🔄 Request Corrections");

    const fixNotesInput = new TextInputBuilder()
        .setCustomId("fix_instructions")
        .setLabel("What should the worker fix?")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Describe what needs to be fixed by the worker...")
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(fixNotesInput)
    );

    await interaction.showModal(modal as any);
}

async function showApproveCustomerRefundModal(
    interaction: ButtonInteraction,
    issueId: string,
    orderId: string,
    orderData: any
): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId(`resolve_refund_modal_${issueId}_${orderId}`)
        .setTitle("❌ Approve Refund - Cancel Order");

    const refundTypeInput = new TextInputBuilder()
        .setCustomId("refund_type")
        .setLabel("Refund Type (FULL, PARTIAL, or NONE)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("FULL")
        .setRequired(true)
        .setMaxLength(10);

    const refundAmountInput = new TextInputBuilder()
        .setCustomId("refund_amount")
        .setLabel("Refund Amount (if PARTIAL, e.g., 100.00)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("0.00")
        .setRequired(false)
        .setMaxLength(10);

    const reasonInput = new TextInputBuilder()
        .setCustomId("cancellation_reason")
        .setLabel("Cancellation Reason")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Explain why the customer was right...")
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(refundTypeInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(refundAmountInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
    );

    await interaction.showModal(modal as any);
}
