import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";
import { collectCompletionScreenshots, storePendingScreenshots } from "../utils/screenshot-collector.util";

export const data = new SlashCommandBuilder()
    .setName("order-action")
    .setDescription("Perform actions on your assigned orders (Workers)")
    .addStringOption((option) =>
        option
            .setName("action")
            .setDescription("Action to perform")
            .setRequired(true)
            .addChoices(
                { name: "🚀 Start Work", value: "start-work" },
                { name: "✅ Mark Complete", value: "mark-complete" }
            )
    )
    .addStringOption((option) =>
        option
            .setName("order-number")
            .setDescription("Order Number (e.g., 11)")
            .setRequired(true)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        const action = interaction.options.getString("action", true);
        const orderNumber = interaction.options.getString("order-number", true);

        if (action === "start-work") {
            await handleStartWork(interaction, orderNumber);
        } else if (action === "mark-complete") {
            await handleMarkComplete(interaction, orderNumber);
        }
    } catch (error: any) {
        logger.error("[OrderAction] Error:", error);
        const errorMessage = extractErrorMessage(error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: `❌ Failed: ${errorMessage}` });
            } else {
                await interaction.reply({ content: `❌ Failed: ${errorMessage}`, ephemeral: true });
            }
        } catch {}
    }
}

async function handleStartWork(interaction: ChatInputCommandInteraction, orderNumber: string) {
    await interaction.deferReply({ ephemeral: true });

    const result = await findOrderByNumber(orderNumber);

    if (!result) {
        await interaction.editReply({ content: `❌ Order not found: **#${orderNumber}**` });
        return;
    }

    const { orderId, orderData } = result;

    if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
        await interaction.editReply({ content: `❌ You are not the assigned worker for Order **#${orderNumber}**.` });
        return;
    }

    if (orderData.status !== "ASSIGNED") {
        await interaction.editReply({
            content: `❌ Cannot start. Status: \`${orderData.status}\`. Must be \`ASSIGNED\`.`,
        });
        return;
    }

    await discordApiClient.put(`/discord/orders/${orderId}/status`, {
        status: "IN_PROGRESS",
        workerDiscordId: interaction.user.id,
        reason: `Worker started work via /order-action`,
    });

    const successEmbed = new EmbedBuilder()
        .setTitle("🚀 Work Started!")
        .setDescription(`You've started working on Order **#${orderNumber}**!`)
        .addFields([
            { name: "Previous Status", value: "`Assigned`", inline: true },
            { name: "New Status", value: "`In Progress`", inline: true },
            { name: "Next Step", value: "Use `/order-action mark-complete` when finished", inline: false },
        ])
        .setColor(0xf1c40f)
        .setTimestamp();

    await interaction.editReply({ embeds: [successEmbed.toJSON() as any] });

    try {
        const { getOrderChannelService } = require("../services/orderChannel.service");
        const orderChannelService = getOrderChannelService(interaction.client);

        if (orderData.ticketChannelId) {
            await orderChannelService.updateOrderMessageStatus(
                orderData.ticketChannelId,
                parseInt(orderNumber),
                orderId,
                "IN_PROGRESS",
                {
                    customerDiscordId: orderData.customer.discordId,
                    workerDiscordId: orderData.worker.discordId,
                    orderValue: parseFloat(orderData.orderValue),
                    depositAmount: parseFloat(orderData.depositAmount),
                    currency: orderData.currency || "USD",
                    serviceName: orderData.service?.name,
                    jobDetails: orderData.jobDetails,
                }
            );
        }
    } catch {}
}

async function handleMarkComplete(interaction: ChatInputCommandInteraction, orderNumber: string) {
    const result = await findOrderByNumber(orderNumber);

    if (!result) {
        await interaction.reply({ content: `❌ Order not found: **#${orderNumber}**`, ephemeral: true });
        return;
    }

    const { orderId, orderData } = result;

    if (!orderData.worker || orderData.worker.discordId !== interaction.user.id) {
        await interaction.reply({ content: `❌ You are not the assigned worker for Order **#${orderNumber}**.`, ephemeral: true });
        return;
    }

    if (orderData.status !== "IN_PROGRESS") {
        await interaction.reply({
            content: `❌ Cannot complete. Status: \`${orderData.status}\`. Must be \`IN_PROGRESS\`.`,
            ephemeral: true,
        });
        return;
    }

    const screenshotResult = await collectCompletionScreenshots(interaction, orderId, orderData.orderNumber);

    if (!screenshotResult.success) return;

    storePendingScreenshots(orderId, screenshotResult.urls);

    const embed = new EmbedBuilder()
        .setTitle("📸 Screenshots Uploaded Successfully!")
        .setDescription(`Click the button below to confirm completion of **Order #${orderNumber}**.`)
        .setColor(0x57f287)
        .setTimestamp();

    const confirmButton = new ButtonBuilder()
        .setCustomId(`show_completion_modal_${orderId}`)
        .setLabel("Complete Order")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅");

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton);

    await interaction.followUp({
        embeds: [embed.toJSON() as any],
        components: [row.toJSON() as any],
        ephemeral: true,
    });
}
