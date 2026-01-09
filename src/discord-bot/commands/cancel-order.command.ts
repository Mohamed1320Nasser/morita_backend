import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

export default {
    data: new SlashCommandBuilder()
        .setName("cancel-order")
        .setDescription("[SUPPORT/ADMIN] Cancel an order")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption((option) =>
            option
                .setName("order-id")
                .setDescription("The order ID to cancel")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Reason for cancellation")
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const member = interaction.member;
            if (!member || !("roles" in member)) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Permission Denied")
                    .setDescription("This command can only be used by Support or Admin members.")
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
                return;
            }

            const isSupport = (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin = (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Permission Denied")
                    .setDescription(
                        "This command can only be used by Support or Admin members.\n\n" +
                        "**Required Role:** Support or Admin"
                    )
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
                return;
            }

            const orderId = interaction.options.get("order-id")?.value as string;
            const reason = interaction.options.get("reason")?.value as string || "Cancelled by support";

            logger.info(`[cancel-order] ${interaction.user.tag} cancelling order ${orderId}`);

            const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
            const orderData = orderResponse.data || orderResponse;

            if (!orderData) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Order Not Found")
                    .setDescription(`Could not find order with ID: \`${orderId}\``)
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
                return;
            }

            if (orderData.status === "CANCELLED") {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ Order Already Cancelled")
                    .setDescription(`Order #${orderData.orderNumber} is already cancelled.`)
                    .setColor(0xffa500)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
                return;
            }

            if (orderData.status === "COMPLETED") {
                const embed = new EmbedBuilder()
                    .setTitle("⚠️ Cannot Cancel Completed Order")
                    .setDescription(
                        `Order #${orderData.orderNumber} is already completed.\n\n` +
                        `Completed orders cannot be cancelled. Use refund process instead.`
                    )
                    .setColor(0xffa500)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
                return;
            }

            // Cancel the order via API
            await discordApiClient.put(`/discord/orders/${orderId}/status`, {
                status: "CANCELLED",
                supportDiscordId: interaction.user.id,
                reason: reason,
            });

            // Build success embed
            const embed = new EmbedBuilder()
                .setTitle("✅ Order Cancelled")
                .setDescription(
                    `**Order #${orderData.orderNumber}** has been cancelled.\n\n` +
                    `**Cancelled by:** <@${interaction.user.id}>\n` +
                    `**Reason:** ${reason}\n\n` +
                    `The customer and worker have been notified.`
                )
                .setColor(0x57f287)
                .addFields(
                    {
                        name: "📦 Order Details",
                        value:
                            `**Order ID:** \`${orderId}\`\n` +
                            `**Customer:** <@${orderData.customerDiscordId}>\n` +
                            `**Worker:** ${orderData.workerDiscordId ? `<@${orderData.workerDiscordId}>` : "Unassigned"}\n` +
                            `**Value:** $${orderData.orderValue.toFixed(2)}`,
                        inline: false,
                    }
                )
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed.toJSON() as any],
            });

            logger.info(`[cancel-order] Order ${orderId} cancelled by ${interaction.user.tag} | Reason: ${reason}`);
        } catch (error: any) {
            logger.error("[cancel-order] Error executing command:", error);

            const errorMessage = error?.response?.data?.message || error?.message || "Unknown error";

            const embed = new EmbedBuilder()
                .setTitle("❌ Failed to Cancel Order")
                .setDescription(
                    `An error occurred while cancelling the order.\n\n` +
                    `**Error:** ${errorMessage}\n\n` +
                    `Please try again or contact an administrator.`
                )
                .setColor(0xed4245)
                .setTimestamp();

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                } else {
                    await interaction.reply({
                        embeds: [embed.toJSON() as any],
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                logger.error("[cancel-order] Failed to send error message:", replyError);
            }
        }
    },
} as Command;
