import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    GuildMember,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { hasSupportOrAdminRole } from "../utils/permissions.util";

export const data = new SlashCommandBuilder()
    .setName("order-status")
    .setDescription("Change order status (Admin/Support only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName("status")
            .setDescription("New status for the order")
            .setRequired(true)
            .addChoices(
                { name: "Pending", value: "PENDING" },
                { name: "Assigned", value: "ASSIGNED" },
                { name: "In Progress", value: "IN_PROGRESS" },
                { name: "Awaiting Confirmation", value: "AWAITING_CONFIRM" },
                { name: "Completed", value: "COMPLETED" },
                { name: "Cancelled", value: "CANCELLED" },
                { name: "Disputed", value: "DISPUTED" },
                { name: "Refunded", value: "REFUNDED" }
            )
    )
    .addStringOption((option) =>
        option
            .setName("reason")
            .setDescription("Reason for status change (optional)")
            .setRequired(false)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderNumber = interaction.options.getString("order-number", true);
        const newStatus = interaction.options.getString("status", true);
        const reason = interaction.options.getString("reason") || undefined;

        logger.info(
            `[OrderStatus] User ${interaction.user.tag} changing order #${orderNumber} status to ${newStatus}`
        );

        const member = interaction.member as GuildMember | null;
        if (!hasSupportOrAdminRole(member)) {
            await interaction.editReply({
                content: "❌ You don't have permission to use this command. (Admin/Support only)",
            });
            return;
        }

        const result = await findOrderByNumber(orderNumber);

        if (!result) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId } = result;

        const orderResponse: any = await discordApiClient.get(`/discord/orders/${orderId}`);
        const order = orderResponse.data || orderResponse;

        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: newStatus,
            workerDiscordId: interaction.user.id,
            reason: reason || `Status changed by ${interaction.user.tag}`,
        });

        const formatStatus = (status: string) => {
            return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        };

        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Order Status Updated")
            .setDescription(
                `Order **#${order.orderNumber}** status has been updated successfully.`
            )
            .addFields([
                {
                    name: "Previous Status",
                    value: `\`${formatStatus(order.status)}\``,
                    inline: true,
                },
                {
                    name: "New Status",
                    value: `\`${formatStatus(newStatus)}\``,
                    inline: true,
                },
                {
                    name: "Changed By",
                    value: `<@${interaction.user.id}>`,
                    inline: true,
                },
            ])
            .setColor(0x2ecc71)
            .setTimestamp();

        if (reason) {
            successEmbed.addFields([{
                name: "📝 Reason",
                value: `> ${reason}`,
                inline: false
            }]);
        }

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        logger.info(
            `[OrderStatus] Order ${orderId} status changed from ${order.status} to ${newStatus} by ${interaction.user.tag}`
        );
    } catch (error: any) {
        logger.error("[OrderStatus] Error changing order status:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to update order status**\n\n${errorMessage}\n\nPlease try again or contact a developer.`,
        });
    }
}
