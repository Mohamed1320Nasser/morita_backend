import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";

export const data = new SlashCommandBuilder()
    .setName("start-work")
    .setDescription("Start working on your assigned order")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderNumber = interaction.options.getString("order-number", true);
        const workerDiscordId = interaction.user.id;

        logger.info(
            `[StartWork] Worker ${interaction.user.tag} starting work on order #${orderNumber}`
        );

        // Find order by order number
        const result = await findOrderByNumber(orderNumber);

        if (!result) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId, orderData } = result;

        // Validate worker is assigned to this order
        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.editReply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.\n\nThis order is assigned to: ${orderData.worker ? orderData.worker.fullname : "No one"}`,
            });
            return;
        }

        // Validate order status
        if (orderData.status !== "ASSIGNED") {
            await interaction.editReply({
                content: `❌ Cannot start work on Order **#${orderNumber}**.\n\nCurrent status: \`${orderData.status}\`\n\nYou can only start work on orders with status \`ASSIGNED\`.`,
            });
            return;
        }

        // Start work - change status to IN_PROGRESS
        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "IN_PROGRESS",
            workerDiscordId,
            reason: `Worker ${interaction.user.tag} started work via /start-work command`,
        });

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle("🚀 Work Started!")
            .setDescription(
                `You've started working on Order **#${orderNumber}**!`
            )
            .addFields([
                {
                    name: "Previous Status",
                    value: "`Assigned`",
                    inline: true,
                },
                {
                    name: "New Status",
                    value: "`In Progress`",
                    inline: true,
                },
                {
                    name: "Next Step",
                    value: "Use `/complete-work` when finished",
                    inline: false,
                },
            ])
            .setColor(0xf1c40f) // Yellow for in progress
            .setTimestamp();

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        logger.info(
            `[StartWork] Order ${orderId} (# ${orderNumber}) status changed to IN_PROGRESS by ${interaction.user.tag}`
        );
    } catch (error: any) {
        logger.error("[StartWork] Error starting work:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to start work**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
