import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { findOrderByNumber } from "../utils/order-search.util";
import { extractErrorMessage } from "../utils/error-message.util";

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
        logger.error("[OrderAction] Error executing order action:", error);

        const errorMessage = extractErrorMessage(error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to perform action**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to perform action**\n\n${errorMessage}\n\nPlease try again or contact support.`,
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.error("[OrderAction] Failed to send error message:", replyError);
        }
    }
}

async function handleStartWork(
    interaction: ChatInputCommandInteraction,
    orderNumber: string
) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const workerDiscordId = interaction.user.id;

        logger.info(
            `[OrderAction-StartWork] Worker ${interaction.user.tag} starting work on order #${orderNumber}`
        );

        const result = await findOrderByNumber(orderNumber);

        if (!result) {
            await interaction.editReply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
            });
            return;
        }

        const { orderId, orderData } = result;

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

        await discordApiClient.put(`/discord/orders/${orderId}/status`, {
            status: "IN_PROGRESS",
            workerDiscordId,
            reason: `Worker ${interaction.user.tag} started work via /order-action command`,
        });

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
                    value: "Use `/order-action mark-complete` when finished",
                    inline: false,
                },
            ])
            .setColor(0xf1c40f) 
            .setTimestamp();

        await interaction.editReply({
            embeds: [successEmbed.toJSON() as any],
        });

        logger.info(
            `[OrderAction-StartWork] Order ${orderId} (#${orderNumber}) status changed to IN_PROGRESS by ${interaction.user.tag}`
        );

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
                logger.info(`[OrderAction-StartWork] Updated pinned message for order #${orderNumber}`);
            }
        } catch (updateError) {
            logger.error(`[OrderAction-StartWork] Failed to update pinned message:`, updateError);
            
        }
    } catch (error) {
        logger.error("[OrderAction-StartWork] Error starting work:", error);
        throw error;
    }
}

async function handleMarkComplete(
    interaction: ChatInputCommandInteraction,
    orderNumber: string
) {
    try {
        
        const result = await findOrderByNumber(orderNumber);

        if (!result) {
            await interaction.reply({
                content: `❌ Order not found: **#${orderNumber}**\n\nPlease check the order number and try again.`,
                ephemeral: true,
            });
            return;
        }

        const { orderId, orderData } = result;
        const workerDiscordId = interaction.user.id;

        if (!orderData.worker || orderData.worker.discordId !== workerDiscordId) {
            await interaction.reply({
                content: `❌ You are not the assigned worker for Order **#${orderNumber}**.`,
                ephemeral: true,
            });
            return;
        }

        if (orderData.status !== "IN_PROGRESS") {
            await interaction.reply({
                content: `❌ Cannot mark Order **#${orderNumber}** as complete.\n\nCurrent status: \`${orderData.status}\`\n\nYou can only mark orders as complete when status is \`IN_PROGRESS\`.`,
                ephemeral: true,
            });
            return;
        }

        logger.info(`[OrderAction-MarkComplete] Worker ${interaction.user.tag} marking order #${orderNumber} as complete`);

        const modal = new ModalBuilder()
            .setCustomId(`complete_order_${orderId}`)
            .setTitle(`Complete Order #${orderNumber}`);

        const confirmationInput = new TextInputBuilder()
            .setCustomId("confirmation_text")
            .setLabel("Type COMPLETE to confirm")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("COMPLETE")
            .setRequired(true)
            .setMaxLength(20);

        const notesInput = new TextInputBuilder()
            .setCustomId("completion_notes")
            .setLabel("Completion Notes (Optional)")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Add any notes about the completed work...")
            .setRequired(false)
            .setMaxLength(1000);

        const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
            confirmationInput
        );
        const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
            notesInput
        );

        modal.addComponents(row1, row2);

        await interaction.showModal(modal as any);

        logger.info(`[OrderAction-MarkComplete] Showed completion modal for order #${orderNumber}`);
    } catch (error) {
        logger.error("[OrderAction-MarkComplete] Error showing completion modal:", error);
        throw error;
    }
}
