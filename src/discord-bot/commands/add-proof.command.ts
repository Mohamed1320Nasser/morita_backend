import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    TextChannel,
} from "discord.js";
import logger from "../../common/loggers";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { discordApiClient } from "../clients/DiscordApiClient";
import { collectProofScreenshots } from "../utils/screenshot-collector.util";

export const data = new SlashCommandBuilder()
    .setName("add-proof")
    .setDescription("Add proof screenshots to an order (can be done anytime)")
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        const orderNumber = interaction.options.getString("order-number", true);

        const orderSearch = await findOrderByNumber(orderNumber);

        if (!orderSearch) {
            await interaction.reply({
                content: `❌ Order not found: **#${orderNumber}**`,
                ephemeral: true,
            });
            return;
        }

        const { orderId, orderData } = orderSearch;

        // Verify worker
        if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
            await interaction.reply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.`,
                ephemeral: true,
            });
            return;
        }

        // Check status
        if (orderData.status !== "ASSIGNED" && orderData.status !== "IN_PROGRESS") {
            await interaction.reply({
                content: `❌ Cannot add proof. Order status must be **ASSIGNED** or **IN_PROGRESS**.\nCurrent status: \`${orderData.status}\``,
                ephemeral: true,
            });
            return;
        }

        // Collect screenshots using the same flow as Mark Complete (with buttons, checkmarks, no deletion)
        const screenshotResult = await collectProofScreenshots(interaction, orderId, orderData.orderNumber);

        if (!screenshotResult.success) {
            if (screenshotResult.cancelled) {
                logger.info(`[AddProof] Worker ${interaction.user.id} cancelled proof upload for order #${orderNumber}`);
            }
            return;
        }

        // Send to API to save
        const response: any = await discordApiClient.put(`/discord/orders/${orderId}/proof`, {
            workerDiscordId: interaction.user.id,
            screenshots: screenshotResult.urls,
        });

        const result = response.data || response;

        // Get updated proof count for logging
        const proofResponse: any = await discordApiClient.get(`/discord/orders/${orderId}/proof`);
        const proofData = proofResponse.data || proofResponse;
        const totalProof = proofData.proofScreenshots?.length || result.totalProofScreenshots || screenshotResult.urls.length;

        // Send public confirmation to channel
        const channel = interaction.channel as TextChannel;
        if (channel) {
            const publicEmbed = new EmbedBuilder()
                .setDescription(`📸 **Proof Added** - <@${interaction.user.id}> added ${screenshotResult.urls.length} proof screenshot(s) to Order #${orderNumber}.\n📊 Total proof screenshots: **${totalProof}**`)
                .setColor(0x57f287)
                .setTimestamp();

            await channel.send({
                embeds: [publicEmbed.toJSON() as any],
            });
        }

        logger.info(`[AddProof] Worker ${interaction.user.id} added ${screenshotResult.urls.length} proof screenshots to order #${orderNumber} (total: ${totalProof})`);
    } catch (error: any) {
        logger.error("[AddProof] Error:", error);
        const errorMessage = extractErrorMessage(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.reply({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            }
        } catch {}
    }
}
