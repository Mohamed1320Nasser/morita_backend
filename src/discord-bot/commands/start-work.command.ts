import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import logger from "../../common/loggers";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { startWorkOnOrder } from "../utils/order-actions.util";

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
        const orderSearch = await findOrderByNumber(orderNumber);

        if (!orderSearch) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId, orderData } = orderSearch;

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

        // Use shared utility function
        const startWorkResult = await startWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            workerDiscordId
        );

        // Send ephemeral response to worker
        await interaction.editReply({
            embeds: [startWorkResult.ephemeralEmbed.toJSON() as any],
            components: [startWorkResult.completeButton.toJSON() as any],
        });

        logger.info(`[StartWork] Order ${orderId} (#${orderNumber}) started successfully via command`);
    } catch (error: any) {
        logger.error("[StartWork] Error starting work:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to start work**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
