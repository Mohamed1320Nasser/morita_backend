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

        // Complete work - change status to AWAITING_CONFIRM
        await discordApiClient.put(`/discord/orders/${orderId}/complete`, {
            workerDiscordId,
            completionNotes,
        });

        // Calculate worker payout (80%)
        const orderValue = parseFloat(orderData.orderValue);
        const workerPayout = orderValue * 0.8;

        // Create success embed
        const successEmbed = new EmbedBuilder()
            .setTitle("✅ Work Completed!")
            .setDescription(
                `You've marked Order **#${orderNumber}** as complete!\n\n` +
                `The customer has been notified and will confirm completion soon.`
            )
            .addFields([
                {
                    name: "Previous Status",
                    value: "`In Progress`",
                    inline: true,
                },
                {
                    name: "New Status",
                    value: "`Awaiting Confirmation`",
                    inline: true,
                },
                {
                    name: "💰 Your Payout",
                    value: `**$${workerPayout.toFixed(2)} USD** (80%)`,
                    inline: false,
                },
                {
                    name: "Next Step",
                    value: "Waiting for customer to confirm completion",
                    inline: false,
                },
            ])
            .setColor(0xf39c12) // Orange for awaiting confirmation
            .setTimestamp();

        if (completionNotes) {
            successEmbed.addFields([
                {
                    name: "📝 Your Notes",
                    value: `> ${completionNotes}`,
                    inline: false,
                }
            ]);
        }

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        logger.info(
            `[CompleteWork] Order ${orderId} (#${orderNumber}) marked as complete by ${interaction.user.tag}`
        );
    } catch (error: any) {
        logger.error("[CompleteWork] Error completing work:", error);

        const errorMessage = extractErrorMessage(error);

        await interaction.editReply({
            content: `❌ **Failed to mark work as complete**\n\n${errorMessage}\n\nPlease try again or contact support.`,
        });
    }
}
