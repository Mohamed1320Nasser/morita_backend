import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    TextChannel,
} from "discord.js";
import logger from "../../common/loggers";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { completeWorkOnOrder } from "../utils/order-actions.util";

export const data = new SlashCommandBuilder()
    .setName("complete-work")
    .setDescription("Mark your work as complete")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    )
    .addStringOption((option) =>
        option
            .setName("notes")
            .setDescription("Completion notes (optional)")
            .setRequired(false)
            .setMaxLength(500)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const orderNumber = interaction.options.getString("order-number", true);
        const completionNotes = interaction.options.getString("notes") || undefined;
        const workerDiscordId = interaction.user.id;

        logger.info(
            `[CompleteWork] Worker ${interaction.user.tag} completing order #${orderNumber}`
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

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.editReply({
                content: `❌ Cannot mark Order **#${orderNumber}** as complete.\n\nCurrent status: \`${orderData.status}\`\n\n${
                    orderData.status === "ASSIGNED"
                        ? "You must use `/start-work` to start working first."
                        : "Order must be `IN_PROGRESS` to mark as complete."
                }`,
            });
            return;
        }

        const orderChannel = interaction.channel instanceof TextChannel ? interaction.channel : undefined;

        const completeResult = await completeWorkOnOrder(
            interaction.client,
            orderId,
            orderData,
            workerDiscordId,
            completionNotes,
            orderChannel
        );

        await interaction.editReply({
            embeds: [completeResult.workerEmbed.toJSON() as any],
        });

        logger.info(`[CompleteWork] Order ${orderId} (#${orderNumber}) completed successfully via command`);
    } catch (error: any) {
        logger.error("[CompleteWork] Error completing work:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to mark work as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
