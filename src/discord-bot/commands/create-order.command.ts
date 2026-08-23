import {
    SlashCommandBuilder,
    CommandInteraction,
    AutocompleteInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import { unwrapApiData } from "../utils/apiResponse.util";
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
                .setName("service")
                .setDescription("Service(s) to link — search, then add more with a comma")
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addUserOption((option) =>
            option
                .setName("worker")
                .setDescription("Assign worker directly (optional)")
                .setRequired(false)
        )
        .addUserOption((option) =>
            option
                .setName("customer")
                .setDescription("Leave blank to use the ticket's customer")
                .setRequired(false)
        ),

    async autocomplete(interaction: AutocompleteInteraction) {
        const typed = interaction.options.getFocused();

        // Several services are entered comma separated. Only the fragment after
        // the last comma is a search term; everything before it is already
        // chosen and must be preserved when a suggestion is picked.
        const lastComma = typed.lastIndexOf(",");
        const committed = lastComma >= 0 ? typed.slice(0, lastComma + 1) : "";
        const fragment = (lastComma >= 0 ? typed.slice(lastComma + 1) : typed).trim();

        const alreadyChosen = committed
            .split(",")
            .map(n => n.trim().toLowerCase())
            .filter(Boolean);

        try {
            const response = await discordApiClient.get("/public/services/lookup/suggest", {
                params: { q: fragment, limit: 25 },
            });

            const suggestions = unwrapApiData<any>(response);
            const services: any[] = Array.isArray(suggestions)
                ? suggestions
                : suggestions?.services || [];

            const choices = services
                .filter(s => !alreadyChosen.includes(String(s.name).toLowerCase()))
                .map(service => {
                    const prefix = committed ? `${committed.trimEnd()} ` : "";
                    // The trailing comma matters: without it, typing to search
                    // for the next service makes the previous pick look like an
                    // unfinished fragment, and selecting overwrites it.
                    const value = `${prefix}${service.name}, `;

                    return {
                        // Discord rejects choice names or values over 100 chars.
                        name: String(service.fullName || service.name).slice(0, 100),
                        value,
                    };
                })
                // A value truncated mid-name would resolve to nothing, so drop
                // suggestions that no longer fit rather than offer a broken one.
                .filter(choice => choice.value.length <= 100)
                .slice(0, 25);

            await interaction.respond(choices);
        } catch (error) {
            logger.error("[create-order] Service autocomplete failed:", error);
            // An empty list degrades to free typing rather than breaking the command.
            await interaction.respond([]);
        }
    },

    async execute(interaction: CommandInteraction) {
        try {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
                await interaction.reply({
                    content: "❌ Only support staff and admins can create orders.",
                    ephemeral: true,
                });
                return;
            }

            const supportUser = interaction.user;
            const channel = interaction.channel;

            logger.info(
                `[create-order] Command executed by ${supportUser.tag} in channel ${channel?.id}`
            );

            const orderValue = interaction.options.get("value")?.value as number;
            const deposit = interaction.options.get("deposit")?.value as number;
            const serviceName = (interaction.options.get("service")?.value as string) || null;
            const currency = "USD";
            const workerUser = interaction.options.get("worker")?.user;

            // Support runs this inside the customer's ticket almost every time,
            // so the option only has to be filled in when there is no ticket to
            // read the customer from.
            let customerUser = interaction.options.get("customer")?.user;
            let customerFromTicket = false;

            if (!customerUser && channel?.id) {
                try {
                    const response: any = await discordApiClient.get(
                        `/discord/tickets/channel/${channel.id}`
                    );
                    const ticket = response?.data?.data || response?.data || response;
                    const ticketCustomerId = ticket?.customerDiscordId || ticket?.customer?.discordId;

                    if (ticketCustomerId) {
                        customerUser = await interaction.client.users
                            .fetch(ticketCustomerId)
                            .catch(() => undefined);
                        customerFromTicket = Boolean(customerUser);
                    }
                } catch (lookupError) {
                    logger.info(
                        `[create-order] No ticket found for channel ${channel.id}, customer must be given explicitly`
                    );
                }
            }

            if (!customerUser) {
                const embed = new EmbedBuilder()
                    .setTitle("❌ Customer Required")
                    .setDescription(
                        "This channel is not a ticket, so the customer could not be detected.\n\n" +
                        "Run the command again and fill in the **customer** option."
                    )
                    .setColor(0xed4245)
                    .setTimestamp();

                await interaction.reply({
                    embeds: [embed.toJSON() as any],
                    ephemeral: true,
                });
                return;
            }

            if (customerFromTicket) {
                logger.info(
                    `[create-order] Customer ${customerUser.tag} taken from ticket in channel ${channel?.id}`
                );
            }

            const orderKey = `order_${customerUser.id}_${Date.now()}`;

            const orderData = {
                customerDiscordId: customerUser.id,
                workerDiscordId: workerUser?.id || null,
                supportDiscordId: supportUser.id,
                channelId: channel?.id,
                ticketId: null,
                serviceName: serviceName,
                orderValue,
                deposit,
                currency,
            };

            await storeOrderData(orderKey, orderData);

            // Name the customer in the title so an auto-detected one is visible
            // before the order is confirmed, not after.
            const modalTitle = `📋 Job for ${customerUser.username}`;

            const modal = new ModalBuilder()
                .setCustomId(`create_order_job_${orderKey}`)
                .setTitle(modalTitle.slice(0, 45));

            const jobDetailsInput = new TextInputBuilder()
                .setCustomId("job_details")
                .setLabel("Job Details")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("Enter job description\n\n⚠️ Do not share passwords or sensitive information")
                .setRequired(false)
                .setMaxLength(2000);

            const detailsRow = new ActionRowBuilder<TextInputBuilder>().addComponents(jobDetailsInput);

            modal.addComponents(detailsRow);

            await interaction.showModal(modal as any);

            logger.info(`[create-order] Showing job details modal for order key: ${orderKey}`);
        } catch (error) {
            logger.error("Error executing create-order command:", error);

            try {
                if (interaction.replied || interaction.deferred) {
                    
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(
                            `Failed to create order.\n\n` +
                            `**Error:** ${error instanceof Error ? error.message : "Unknown error"}\n\n` +
                            `Please try again or contact an administrator.`
                        )
                        .setColor(0xed4245)
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                } else if (!interaction.isModalSubmit()) {

                    const embed = new EmbedBuilder()
                        .setTitle("❌ Error")
                        .setDescription(
                            `Failed to create order.\n\n` +
                            `**Error:** ${error instanceof Error ? error.message : "Unknown error"}\n\n` +
                            `Please try again or contact an administrator.`
                        )
                        .setColor(0xed4245)
                        .setTimestamp();

                    await interaction.reply({
                        embeds: [embed.toJSON() as any],
                        ephemeral: true,
                    });
                } else {
                    
                    logger.warn("[create-order] Modal already shown, cannot send error message to user");
                }
            } catch (replyError) {
                logger.error("[create-order] Failed to send error message:", replyError);
                
            }
        }
    },
} as Command;
