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

        const orderSearch = await findOrderByNumber(orderNumber);

        if (!orderSearch) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId, orderData } = orderSearch;

        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.editReply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.\n\nThis order is assigned to: ${orderData.worker ? orderData.worker.fullname : "No one"}`,
            });
            return;
        }

        if (orderData.status !== "ASSIGNED") {
            await interaction.editReply({
                content: `❌ Cannot start work on Order **#${orderNumber}**.\n\nCurrent status: \`${orderData.status}\`\n\nYou can only start work on orders with status \`ASSIGNED\`.`,
            });
            return;
        }

        const startWorkResult = await startWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            workerDiscordId
        );

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
