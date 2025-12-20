import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { storeOrderData } from "../interactions/modals/create-order-job.modal";

export default {
    data: new SlashCommandBuilder()
        .setName("create-order")
        .setDescription("[SUPPORT] Create an order for the customer in this ticket")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addUserOption((option) =>
            option
                .setName("customer")
                .setDescription("The customer for this order")
                .setRequired(true)
        )
        .addNumberOption((option) =>
            option
                .setName("value")
                .setDescription("Order value in USD")
                .setRequired(true)
                .setMinValue(0.01)
        )
        .addNumberOption((option) =>
            option
                .setName("deposit")
                .setDescription("Deposit amount to lock from customer wallet")
                .setRequired(true)
                .setMinValue(0)
        )
        .addStringOption((option) =>
            option
                .setName("currency")
                .setDescription("Currency (default: USD)")
                .setRequired(false)
                .addChoices(
                    { name: "USD", value: "USD" },
                    { name: "EUR", value: "EUR" },
                    { name: "GBP", value: "GBP" }
                )
        )
        .addUserOption((option) =>
            option
                .setName("worker")
                .setDescription("Assign worker directly (optional)")
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            const supportUser = interaction.user;
            const channel = interaction.channel;

            logger.info(
                `[create-order] Command executed by ${supportUser.tag} in channel ${channel?.id}`
            );

            // Check if this is a ticket channel
            const channelName = (channel as any)?.name;
            if (!channelName || !channelName.startsWith("ticket-")) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Invalid Channel")
                    .setDescription(
                        "This command can only be used in ticket channels.\n\n" +
                        "Please use this command in a customer's ticket channel."
                    )
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
                return;
            }

            // Get command options
            const customerUser = interaction.options.get("customer")?.user;
            const orderValue = interaction.options.get("value")?.value as number;
            const deposit = interaction.options.get("deposit")?.value as number;
            const currency = (interaction.options.get("currency")?.value as string) || "USD";
            const workerUser = interaction.options.get("worker")?.user;

            if (!customerUser) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Invalid Input")
                    .setDescription("Customer is required.")
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
                return;
            }

            // Fetch ticket for this channel
            let ticketId = null;
            try {
                const ticketResponse = await discordApiClient.get(`/api/discord/tickets/channel/${channel?.id}`);
                const ticketData = ticketResponse.data.data?.data || ticketResponse.data.data || ticketResponse.data;
                if (ticketData && ticketData.id) {
                    ticketId = ticketData.id;
                    logger.info(`[create-order] Found ticket ${ticketId} for channel ${channel?.id}`);
                } else {
                    logger.warn(`[create-order] No ticket found for channel ${channel?.id}`);
                }
            } catch (err) {
                logger.error(`[create-order] Failed to fetch ticket for channel:`, err);
            }

            // Generate unique key for this order
            const orderKey = `order_${customerUser.id}_${Date.now()}`;

            // Store order data temporarily
            const orderData = {
                customerDiscordId: customerUser.id,
                workerDiscordId: workerUser?.id || null,
                supportDiscordId: supportUser.id,
                channelId: channel?.id,
                ticketId: ticketId,
                orderValue,
                deposit,
                currency,
            };

            storeOrderData(orderKey, orderData);

            // Show job details modal
            const modal = new ModalBuilder()
                .setCustomId(`create_order_job_${orderKey}`)
                .setTitle("📋 Job Description");

            const jobDetailsInput = new TextInputBuilder()
                .setCustomId("job_details")
                .setLabel("Job Details")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Enter job description\n\n⚠️ Do not share passwords or sensitive information")
                .setRequired(false)
                .setMaxLength(2000);

            const detailsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(jobDetailsInput);

            modal.addComponents(detailsRow);

            // Show the modal
            await interaction.showModal(modal as any);

            logger.info(`[create-order] Showing job details modal for order key: ${orderKey}`);
        } catch (error) {
            logger.error("Error executing create-order command:", error);

            const embed = new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription(
                    `Failed to create order.\n\n` +
                    `**Error:** ${error instanceof Error ? error.message : "Unknown error"}\n\n` +
                    `Please try again or contact an administrator.`
                )
                .setColor(0xed4245)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else {
                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
