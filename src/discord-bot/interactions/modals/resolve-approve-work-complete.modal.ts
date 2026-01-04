import { ModalSubmitInteraction, EmbedBuilder, TextChannel } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { discordConfig } from "../../config/discord.config";
import { confirmOrderCompletion } from "../../utils/order-actions.util";
import { isAdminOrSupport } from "../../utils/role-check.util";

export async function handleResolveApproveWorkCompleteModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Parse customId: resolve_approve_work_modal_{issueId}_{orderId}
        const parts = interaction.customId.split("_");
        const issueId = parts[parts.length - 2];
        const orderId = parts[parts.length - 1];

        const confirmation = interaction.fields.getTextInputValue("confirmation").trim().toUpperCase();
        const resolutionNotes = interaction.fields.getTextInputValue("resolution_notes").trim();

        logger.info(`[ApproveWorkComplete] Processing resolution for issue ${issueId}, order ${orderId}`);

        // Validate user has admin or support role
        const hasPermission = await isAdminOrSupport(interaction.client, interaction.user.id);
        if (!hasPermission) {
            await interaction.editReply({
                content: `❌ **Permission Denied**\n\nOnly users with Admin or Support roles can resolve issues.\n\nPlease contact an administrator.`,
            });
            logger.warn(`[ApproveWorkComplete] User ${interaction.user.tag} (${interaction.user.id}) attempted to resolve issue without permission`);
            return;
        }

        // Validate confirmation (case-insensitive)
        if (confirmation !== "COMPLETE") {
            await interaction.editReply({
                content: `❌ **Invalid confirmation.**\n\nYou typed: \`${confirmation}\`\nRequired: \`COMPLETE\` (exactly 8 characters)\n\nPlease try again.`,
            });
            return;
        }

        // Note: Issue will be automatically marked as resolved when order is completed
        logger.info(`[ApproveWorkComplete] Admin ${interaction.user.tag} approved work for issue ${issueId}`);

        // Get order data
        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const orderData = orderResponse.data || orderResponse;

        // Validate order has customer
        if (!orderData.customer?.discordId) {
            await interaction.editReply({
                content: "❌ **Error:** Order has no customer assigned.",
            });
            return;
        }

        // Step 1: If order is DISPUTED, first transition to AWAITING_CONFIRM
        if (orderData.status === "DISPUTED") {
            logger.info(`[ApproveWorkComplete] Order is DISPUTED, transitioning to AWAITING_CONFIRM first`);
            await discordApiClient.put(`/discord/orders/${orderId}/status`, {
                status: "AWAITING_CONFIRM",
                changedByDiscordId: interaction.user.id,
                reason: `Admin approved work - Issue resolved in worker's favor`,
                notes: `Resolution: ${resolutionNotes}\n\nResolved by: ${interaction.user.tag}`,
                isAdminOverride: true, // Admin/Support override - bypass worker validation
            });
        }

        // Step 2: Call /confirm endpoint to complete the order and trigger payouts
        // Use customer's Discord ID (admin is confirming on behalf of customer)
        await discordApiClient.put(`/discord/orders/${orderId}/confirm`, {
            customerDiscordId: orderData.customer.discordId,
            feedback: `✅ Issue Resolved by Admin - Work Approved\n\nResolution: ${resolutionNotes}\n\nResolved by: ${interaction.user.tag}`,
        });

        logger.info(`[ApproveWorkComplete] Order ${orderId} confirmed via /confirm endpoint, payouts triggered`);

        // Step 3: Get updated order data with completion info
        const updatedOrderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const updatedOrderData = updatedOrderResponse.data || updatedOrderResponse;

        // Step 4: Get order channel for notifications
        const orderChannel = orderData.discordChannelId
            ? await interaction.client.channels.fetch(orderData.discordChannelId).catch(() => null)
            : null;

        // Step 5: Handle all Discord notifications (customer/worker DMs, channel updates, support notifications)
        // Also send review request to customer in order channel
        const confirmResult = await confirmOrderCompletion(
            interaction.client,
            orderId,
            updatedOrderData,
            interaction.user.id,
            `✅ Issue Resolved by Admin - Work Approved\n\nResolution: ${resolutionNotes}\n\nResolved by: ${interaction.user.tag}`,
            orderChannel instanceof TextChannel ? orderChannel : undefined,
            true // Send review request in order channel
        );

        logger.info(`[ApproveWorkComplete] All Discord notifications sent for order ${orderId}`);

        // Success message to admin/support
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Issue Resolved - Work Approved")
            .setDescription(
                `The issue has been resolved and the work has been approved.\n\n` +
                `Order #${orderData.orderNumber} has been marked as **COMPLETED**.`
            )
            .addFields([
                { name: "📦 Order", value: `#${orderData.orderNumber}`, inline: true },
                { name: "🆔 Issue ID", value: `\`${issueId}\``, inline: true },
                { name: "📊 Resolution", value: "Work Approved - Order Completed", inline: false },
                { name: "📝 Notes", value: resolutionNotes.substring(0, 1024), inline: false },
                { name: "✅ Actions Taken", value:
                    "• Issue marked as RESOLVED\n" +
                    "• Order marked as COMPLETED\n" +
                    "• Worker payout processed\n" +
                    "• Review request sent to customer\n" +
                    "• Posted to completed-orders channel\n" +
                    "• Notifications sent to all parties",
                    inline: false
                },
            ])
            .setColor(0x57f287) // Green
            .setTimestamp()
            .setFooter({ text: `Resolved by ${interaction.user.tag}` });

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        // Update the issue in database and Discord message
        try {
            // Mark issue as RESOLVED in database
            await discordApiClient.put(`/discord/orders/issues/${issueId}`, {
                status: "RESOLVED",
                resolution: `✅ Worker Right - Order Completed\n\n${resolutionNotes}\n\nResolved by: ${interaction.user.tag}`,
                resolvedByDiscordId: interaction.user.id,
            });

            logger.info(`[ApproveWorkComplete] Marked issue ${issueId} as RESOLVED in database`);

            // Update Discord message in issues channel
            const issuesChannel = await interaction.client.channels.fetch(discordConfig.issuesChannelId);
            if (issuesChannel?.isTextBased()) {
                const issueData = await discordApiClient.get(`/discord/orders/issues/${issueId}`);
                const issue = issueData.data || issueData;

                if (issue.discordMessageId) {
                    const issueMessage = await issuesChannel.messages.fetch(issue.discordMessageId);

                    const resolvedEmbed = new EmbedBuilder(issueMessage.embeds[0].data)
                        .setColor(0x57f287) // Green
                        .setTitle(`✅ RESOLVED - ${issueMessage.embeds[0].title}`);

                    resolvedEmbed.addFields({
                        name: "✅ Resolution",
                        value: `**Worker Right - Order Completed**\n${resolutionNotes}\n\nResolved by: <@${interaction.user.id}>`,
                        inline: false,
                    });

                    await issueMessage.edit({
                        embeds: [resolvedEmbed.toJSON() as any],
                        components: [], // Remove resolution buttons
                    });

                    logger.info(`[ApproveWorkComplete] Updated issue message in Discord`);
                }
            }
        } catch (updateError) {
            logger.error(`[ApproveWorkComplete] Failed to update issue:`, updateError);
            // Don't fail the whole operation if we can't update the issue message
        }

        logger.info(`[ApproveWorkComplete] Resolution completed successfully`);
    } catch (error: any) {
        logger.error("[ApproveWorkComplete] Error processing resolution:", error);

        const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to resolve issue**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to resolve issue**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[ApproveWorkComplete] Failed to send error message:", replyError);
        }
    }
}
