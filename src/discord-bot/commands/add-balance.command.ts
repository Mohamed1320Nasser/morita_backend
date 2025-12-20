import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    TextChannel,
} from "discord.js";
import { Command } from "../types/discord.types";
import { getTicketService } from "../services/ticket.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

export default {
    data: new SlashCommandBuilder()
        .setName("add-balance")
        .setDescription("Add balance to a user's wallet (Support/Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addNumberOption(option =>
            option
                .setName("amount")
                .setDescription("Amount to add (USD)")
                .setRequired(true)
                .setMinValue(0.01)
        )
        .addStringOption(option =>
            option
                .setName("type")
                .setDescription("Transaction type (default: Deposit)")
                .setRequired(false)
                .addChoices(
                    { name: "💰 Deposit", value: "DEPOSIT" },
                    { name: "💸 Spent", value: "PAYMENT" },
                    { name: "💵 Earnings", value: "EARNING" },
                    { name: "🔧 Adjustment", value: "ADJUSTMENT" }
                )
        )
        .addUserOption(option =>
            option
                .setName("user")
                .setDescription("Target user (auto-detected in tickets, editable)")
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName("note")
                .setDescription("Note/reason (optional)")
                .setRequired(false)
                .setMaxLength(200)
        )
        .addStringOption(option =>
            option
                .setName("reference")
                .setDescription("Payment reference/ID (optional)")
                .setRequired(false)
                .setMaxLength(100)
        )
        .addStringOption(option =>
            option
                .setName("payment_method")
                .setDescription("Payment method (optional)")
                .setRequired(false)
                .setMaxLength(50)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Check if user has support or admin role
            const member = interaction.member;
            const isSupport =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.supportRoleId);
            const isAdmin =
                member &&
                "roles" in member &&
                (member.roles as any).cache?.has(discordConfig.adminRoleId);

            if (!isSupport && !isAdmin) {
                await interaction.editReply({
                    content: "❌ You do not have permission to use this command. Only Support and Admin can add balance.",
                });
                return;
            }

            // Get command options
            const amount = interaction.options.get("amount")?.value as number;
            const transactionType = (interaction.options.get("type")?.value as string) || "DEPOSIT";
            const note = interaction.options.get("note")?.value as string | undefined;
            const reference = interaction.options.get("reference")?.value as string | undefined;
            const paymentMethod = interaction.options.get("payment_method")?.value as string | undefined;

            // Get or auto-detect target user
            let targetUser = interaction.options.get("user")?.user || null;
            let targetDiscordId: string | null = targetUser?.id || null;
            let ticketId: string | null = null;
            let ticketNumber: number | null = null;

            const channel = interaction.channel;
            const isTicketChannel = channel instanceof TextChannel &&
                (channel.name.startsWith(discordConfig.ticketChannelPrefix) ||
                 channel.name.startsWith("closed-"));

            // Auto-detect customer from ticket if not specified
            if (isTicketChannel && !targetUser) {
                const ticketService = getTicketService(interaction.client);
                const ticket = await ticketService.getTicketByChannelId(channel.id);

                if (ticket) {
                    targetDiscordId = ticket.customerDiscordId;
                    ticketId = ticket.id;
                    ticketNumber = ticket.ticketNumber;

                    try {
                        const discordUser = await interaction.client.users.fetch(targetDiscordId!);
                        targetUser = discordUser;
                    } catch {
                        logger.warn(`Could not fetch user ${targetDiscordId}`);
                    }
                }
            }

            // If still no target user, show error
            if (!targetDiscordId) {
                await interaction.editReply({
                    content: "❌ **No target user specified**\n\nPlease either:\n• Use this command in a ticket channel (auto-detects customer)\n• Or specify a user: `/add-balance amount:100 user:@username`",
                });
                return;
            }

            // Get or create support user
            let supportUserId: number = 1;
            try {
                const supportUserResponse = await discordApiClient.post(
                    `/discord/wallets/discord/${interaction.user.id}`,
                    {
                        username: interaction.user.username,
                        walletType: "SUPPORT",
                    }
                );
                const apiResponse = supportUserResponse.data;
                const walletData = apiResponse.data || apiResponse;
                supportUserId = walletData.userId || walletData.user?.id || 1;
            } catch (err) {
                logger.error("Failed to get support user:", err);
                supportUserId = 1;
            }

            // Call add balance API
            logger.info(`[AddBalance] Adding $${amount} (${transactionType}) to user ${targetDiscordId}`);

            const response: any = await discordApiClient.post("/discord/wallets/add-balance", {
                customerDiscordId: targetDiscordId,
                amount,
                transactionType,
                reference,
                notes: note ? `${note}${paymentMethod ? `\nPayment Method: ${paymentMethod}` : ""}` : (paymentMethod ? `Payment Method: ${paymentMethod}` : undefined),
                createdById: supportUserId,
            });

            logger.info(`[AddBalance] API Response: ${JSON.stringify(response)}`);

            // Handle triple-nested response
            // HttpClient interceptor already unwrapped one level
            const outerData = response.data || response;
            const responseData = outerData.data || outerData;

            if (!response.success && response.success !== undefined) {
                throw new Error("Failed to add balance");
            }

            // Extract balance info
            let previousBalance = "0.00";
            let newBalance = "0.00";

            if (responseData.previousBalance !== undefined) {
                previousBalance = parseFloat(responseData.previousBalance).toFixed(2);
            }

            if (responseData.newBalance !== undefined) {
                newBalance = parseFloat(responseData.newBalance).toFixed(2);
            } else if (responseData.wallet?.balance !== undefined) {
                newBalance = parseFloat(responseData.wallet.balance).toFixed(2);
            }

            logger.info(`[AddBalance] Balance: ${previousBalance} -> ${newBalance}`);

            // Get target user mention
            const targetMention = `<@${targetDiscordId}>`;

            // Try to get target user's avatar
            let userAvatar = null;
            try {
                if (targetUser) {
                    userAvatar = targetUser.displayAvatarURL();
                } else {
                    const fetchedUser = await interaction.client.users.fetch(targetDiscordId);
                    userAvatar = fetchedUser.displayAvatarURL();
                }
            } catch (err) {
                logger.warn(`Could not fetch user avatar for ${targetDiscordId}`);
            }

            // Send SHORT confirmation to support (ephemeral - only they see it)
            await interaction.editReply({
                content: `✅ Successfully added **$${amount.toFixed(2)} USD** to ${targetMention}'s wallet\n` +
                    `New Balance: **$${newBalance} USD** ${note ? `\n📝 Note: ${note}` : ""}`,
            });

            // Send DETAILED notification to customer in channel (public - professional showcase)
            if (channel && channel instanceof TextChannel) {
                const notificationEmbed = new EmbedBuilder()
                    .setAuthor({
                        name: "Morita Wallet",
                        iconURL: interaction.client.user?.displayAvatarURL() || undefined
                    })
                    .setTitle("💰 Balance Deposit Received")
                    .setDescription(
                        `${targetMention}, **$${amount.toFixed(2)} USD** has been added to your wallet!`
                    )
                    .addFields(
                        {
                            name: "Previous Balance",
                            value: `\`\`\`diff\n- $${previousBalance} USD\n\`\`\``,
                            inline: true,
                        },
                        {
                            name: "New Balance",
                            value: `\`\`\`diff\n+ $${newBalance} USD\n\`\`\``,
                            inline: true,
                        },
                        {
                            name: "Transaction Type",
                            value: `\`${transactionType}\``,
                            inline: true,
                        }
                    )
                    .setColor(0xffd700)
                    .setTimestamp()
                    .setThumbnail(userAvatar);

                // Add optional transaction details if provided
                const transactionDetails = [];
                if (paymentMethod) {
                    transactionDetails.push(`💳 **Payment Method:** ${paymentMethod}`);
                }
                if (reference) {
                    transactionDetails.push(`🔢 **Reference:** ${reference}`);
                }
                if (note) {
                    transactionDetails.push(`📝 **Note:** ${note}`);
                }

                if (transactionDetails.length > 0) {
                    notificationEmbed.addFields({
                        name: "📋 Transaction Details",
                        value: transactionDetails.join("\n"),
                        inline: false,
                    });
                }

                notificationEmbed.setFooter({
                    text: `Processed by ${interaction.user.username} • Use /wallet to view full history`
                });

                await channel.send({
                    content: targetMention,
                    embeds: [notificationEmbed.toJSON() as any],
                });
            }

            logger.info(
                `[AddBalance] Successfully added $${amount} (${transactionType}) to ${targetDiscordId} by ${interaction.user.tag}`
            );
        } catch (error) {
            logger.error("Error executing add-balance command:", error);

            const errorMessage =
                error instanceof Error ? error.message : "Unknown error occurred";

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({
                    content: `❌ **Failed to add balance**\n\n${errorMessage}\n\nPlease try again or contact an administrator.`,
                });
            } else {
                await interaction.reply({
                    content: `❌ **Failed to add balance**\n\n${errorMessage}\n\nPlease try again or contact an administrator.`,
                    ephemeral: true,
                });
            }
        }
    },
} as Command;
