import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    GuildMember,
} from "discord.js";
import { Command } from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { unwrapApiData } from "../utils/apiResponse.util";
import { syncUserDiscordRole } from "../utils/role-sync.util";

type RefundType = "full" | "partial" | "none";

/** Looks an order up by number ("12" or "#12") or by its ID. */
async function fetchOrderByRef(ref: string): Promise<any> {
    const value = ref.trim().replace(/^#/, "");
    const path = /^\d+$/.test(value)
        ? `/discord/orders/number/${value}`
        : `/discord/orders/${encodeURIComponent(value)}`;
    return unwrapApiData<any>(await discordApiClient.get(path));
}

function apiErrorMessage(error: any): string {
    const body = error?.response?.data;
    return body?.msg || body?.message || error?.message || "Unknown error";
}

function errorEmbed(title: string, description: string) {
    return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xed4245).setTimestamp();
}

export default {
    data: new SlashCommandBuilder()
        .setName("cancel-order")
        .setDescription("[SUPPORT/ADMIN] Cancel an order, refund the customer and return the worker's deposit")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption((option) =>
            option
                .setName("order-id")
                .setDescription("Order number (e.g. 12) or order ID")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("reason")
                .setDescription("Reason for cancellation")
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName("refund")
                .setDescription("How much to refund the customer (default: full)")
                .setRequired(false)
                .addChoices(
                    { name: "Full refund", value: "full" },
                    { name: "Partial refund", value: "partial" },
                    { name: "No refund", value: "none" }
                )
        )
        .addNumberOption((option) =>
            option
                .setName("refund-amount")
                .setDescription("Amount to refund (only for a partial refund)")
                .setRequired(false)
                .setMinValue(0)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: false });

            const member = interaction.member;
            const roles = member && "roles" in member ? (member.roles as any) : null;
            const isSupport = roles?.cache?.has(discordConfig.supportRoleId);
            const isAdmin = roles?.cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        "❌ Permission Denied",
                        "This command can only be used by Support or Admin members."
                    ).toJSON() as any],
                });
                return;
            }

            const orderRef = interaction.options.get("order-id")?.value as string;
            const reason = (interaction.options.get("reason")?.value as string) || "Cancelled by support";
            const refundType = ((interaction.options.get("refund")?.value as string) || "full") as RefundType;
            const refundAmount = interaction.options.get("refund-amount")?.value as number | undefined;

            if (refundType === "partial" && (refundAmount === undefined || refundAmount === null)) {
                await interaction.editReply({
                    embeds: [errorEmbed(
                        "❌ Refund Amount Missing",
                        "For a partial refund, also fill in `refund-amount`."
                    ).toJSON() as any],
                });
                return;
            }

            logger.info(`[cancel-order] ${interaction.user.tag} cancelling order ${orderRef} (${refundType} refund)`);

            let orderData: any;
            try {
                orderData = await fetchOrderByRef(orderRef);
            } catch (lookupError: any) {
                if (lookupError?.response?.status === 404 || lookupError?.response?.status === 400) {
                    await interaction.editReply({
                        embeds: [errorEmbed(
                            "❌ Order Not Found",
                            `No order found for \`${orderRef}\`. Use the order number (e.g. \`12\`) or the full order ID.`
                        ).toJSON() as any],
                    });
                    return;
                }
                throw lookupError;
            }

            if (orderData.status === "CANCELLED" || orderData.status === "COMPLETED") {
                await interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setTitle(orderData.status === "CANCELLED" ? "⚠️ Order Already Cancelled" : "⚠️ Cannot Cancel Completed Order")
                        .setDescription(
                            orderData.status === "CANCELLED"
                                ? `Order #${orderData.orderNumber} is already cancelled.`
                                : `Order #${orderData.orderNumber} is already completed. Use the refund process instead.`
                        )
                        .setColor(0xfca311)
                        .setTimestamp()
                        .toJSON() as any],
                });
                return;
            }

            // The API checks the canceller's stored role, so bring it up to date first
            if (member instanceof GuildMember) {
                await syncUserDiscordRole(member).catch(() => null);
            }

            // The cancel endpoint refunds the customer and returns the worker's deposit;
            // a bare status change would leave both locked.
            await discordApiClient.put(`/discord/orders/${orderData.id}/cancel`, {
                cancelledByDiscordId: interaction.user.id,
                cancellationReason: reason,
                refundType,
                ...(refundType === "partial" && { refundAmount }),
            });

            const orderValue = Number(orderData.orderValue || 0);
            const refunded =
                refundType === "full" ? orderValue : refundType === "partial" ? Number(refundAmount) : 0;
            const customerId = orderData.customer?.discordId;
            const workerId = orderData.worker?.discordId;

            const embed = new EmbedBuilder()
                .setTitle("✅ Order Cancelled")
                .setDescription(
                    `**Order #${orderData.orderNumber}** has been cancelled.\n\n` +
                    `**Cancelled by:** <@${interaction.user.id}>\n` +
                    `**Reason:** ${reason}`
                )
                .setColor(0xfca311)
                .addFields({
                    name: "💰 Money",
                    value:
                        `**Order value:** $${orderValue.toFixed(2)}\n` +
                        `**Refunded to customer:** $${refunded.toFixed(2)}\n` +
                        (workerId ? `**Worker deposit:** returned to the worker` : `**Worker:** none assigned`),
                    inline: false,
                })
                .addFields({
                    name: "📦 Order",
                    value:
                        `**Customer:** ${customerId ? `<@${customerId}>` : "Unknown"}\n` +
                        `**Worker:** ${workerId ? `<@${workerId}>` : "Unassigned"}`,
                    inline: false,
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed.toJSON() as any] });

            logger.info(`[cancel-order] Order #${orderData.orderNumber} cancelled by ${interaction.user.tag} | Reason: ${reason}`);
        } catch (error: any) {
            logger.error("[cancel-order] Error executing command:", error);

            const embed = errorEmbed(
                "❌ Failed to Cancel Order",
                `An error occurred while cancelling the order.\n\n` +
                `**Error:** ${apiErrorMessage(error)}\n\n` +
                `Please try again or contact an administrator.`
            );

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ embeds: [embed.toJSON() as any] });
                } else {
                    await interaction.reply({ embeds: [embed.toJSON() as any], ephemeral: true });
                }
            } catch (replyError) {
                logger.error("[cancel-order] Failed to send error message:", replyError);
            }
        }
    },
} as Command;
