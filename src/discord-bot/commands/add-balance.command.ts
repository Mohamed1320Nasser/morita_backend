import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
    TextChannel,
    User,
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
                .setDescription("Transaction type (default: Balance)")
                .setRequired(false)
                .addChoices(
                    { name: "💰 Balance (Customer)", value: "BALANCE" },
                    { name: "🔐 Worker Deposit", value: "WORKER_DEPOSIT" },
                    { name: "🔧 Adjustment (Manual Fix)", value: "ADJUSTMENT" }
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

            if (!hasPermission(interaction)) {
                await interaction.editReply({
                    content: "❌ You do not have permission to use this command. Only Support and Admin can add balance.",
                });
                return;
            }

            const options = extractOptions(interaction);
            const targetInfo = await getTargetUser(interaction, options.specifiedUser);

            if (!targetInfo.discordId) {
                await interaction.editReply({
                    content: "❌ **No target user specified**\n\nPlease either:\n• Use this command in a ticket channel (auto-detects customer)\n• Or specify a user: `/add-balance amount:100 user:@username`",
                });
                return;
            }

            const supportUserId = await getSupportUserId(interaction);
            const response = await addBalanceViaAPI(targetInfo, options, supportUserId);
            const balanceData = extractBalanceData(response, options.transactionType);

            await sendNotificationEmbed(
                interaction,
                targetInfo,
                options,
                balanceData
            );

            await interaction.deleteReply();

            logger.info(`[AddBalance] $${options.amount} (${options.transactionType}) added to ${targetInfo.discordId} by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("[AddBalance] Error:", error);

            const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";

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

function hasPermission(interaction: CommandInteraction): boolean {
    const member = interaction.member;
    const isSupport = member && "roles" in member && (member.roles as any).cache?.has(discordConfig.supportRoleId);
    const isAdmin = member && "roles" in member && (member.roles as any).cache?.has(discordConfig.adminRoleId);
    return isSupport || isAdmin;
}

function extractOptions(interaction: CommandInteraction) {
    return {
        amount: interaction.options.get("amount")?.value as number,
        transactionType: (interaction.options.get("type")?.value as string) || "BALANCE",
        note: interaction.options.get("note")?.value as string | undefined,
        reference: interaction.options.get("reference")?.value as string | undefined,
        paymentMethod: interaction.options.get("payment_method")?.value as string | undefined,
        specifiedUser: interaction.options.get("user")?.user || null,
    };
}

async function getTargetUser(interaction: CommandInteraction, specifiedUser: User | null) {
    if (specifiedUser) {
        return {
            user: specifiedUser,
            discordId: specifiedUser.id,
        };
    }

    const channel = interaction.channel;
    const isTicketChannel = channel instanceof TextChannel &&
        (channel.name.startsWith(discordConfig.ticketChannelPrefix) || channel.name.startsWith("closed-"));

    if (isTicketChannel) {
        const ticketService = getTicketService(interaction.client);
        const ticket = await ticketService.getTicketByChannelId(channel.id);

        if (ticket) {
            try {
                const user = await interaction.client.users.fetch(ticket.customerDiscordId);
                return { user, discordId: ticket.customerDiscordId };
            } catch {
                return { user: null, discordId: ticket.customerDiscordId };
            }
        }
    }

    return { user: null, discordId: null };
}

async function getSupportUserId(interaction: CommandInteraction): Promise<number> {
    try {
        const supportDisplayName = interaction.user.displayName || interaction.user.globalName;
        const response = await discordApiClient.post(
            `/discord/wallets/discord/${interaction.user.id}`,
            {
                username: supportDisplayName || interaction.user.username,
                walletType: "SUPPORT",
            }
        );
        const apiResponse = response.data;
        const walletData = apiResponse.data || apiResponse;
        return walletData.userId || walletData.user?.id || 1;
    } catch (err) {
        logger.error("[AddBalance] Failed to get support user:", err);
        return 1;
    }
}

async function addBalanceViaAPI(targetInfo: any, options: any, supportUserId: number) {
    const notes = options.note
        ? `${options.note}${options.paymentMethod ? `\nPayment Method: ${options.paymentMethod}` : ""}`
        : (options.paymentMethod ? `Payment Method: ${options.paymentMethod}` : undefined);

    const response = await discordApiClient.post("/discord/wallets/add-balance", {
        customerDiscordId: targetInfo.discordId,
        customerDiscordUsername: targetInfo.user?.username,
        customerDiscordDisplayName: targetInfo.user?.displayName || targetInfo.user?.globalName,
        amount: options.amount,
        transactionType: options.transactionType,
        reference: options.reference,
        notes,
        createdById: supportUserId,
    });

    if (!response.success && response.success !== undefined) {
        throw new Error("Failed to add balance");
    }

    return response;
}

function extractBalanceData(response: any, transactionType: string) {
    const outerData = response.data || response;
    const responseData = outerData.data || outerData;
    const isWorkerDeposit = transactionType === "WORKER_DEPOSIT";

    let previousValue = "0.00";
    let newValue = "0.00";

    if (isWorkerDeposit) {
        if (responseData.depositBefore !== undefined) {
            previousValue = parseFloat(responseData.depositBefore).toFixed(2);
        }
        if (responseData.depositAfter !== undefined) {
            newValue = parseFloat(responseData.depositAfter).toFixed(2);
        } else if (responseData.wallet?.deposit !== undefined) {
            newValue = parseFloat(responseData.wallet.deposit).toFixed(2);
        }
    } else {
        if (responseData.previousBalance !== undefined) {
            previousValue = parseFloat(responseData.previousBalance).toFixed(2);
        }
        if (responseData.newBalance !== undefined) {
            newValue = parseFloat(responseData.newBalance).toFixed(2);
        } else if (responseData.wallet?.balance !== undefined) {
            newValue = parseFloat(responseData.wallet.balance).toFixed(2);
        }
    }

    return { previousValue, newValue, isWorkerDeposit };
}

async function sendNotificationEmbed(
    interaction: CommandInteraction,
    targetInfo: any,
    options: any,
    balanceData: any
) {
    const channel = interaction.channel;
    if (!channel || !(channel instanceof TextChannel)) return;

    const { previousValue, newValue, isWorkerDeposit } = balanceData;
    const targetMention = `<@${targetInfo.discordId}>`;

    const userAvatar = await getUserAvatar(interaction.client, targetInfo);

    const embedTitle = isWorkerDeposit ? "🔐 Worker Deposit Received" : "💰 Balance Deposit Received";
    const embedDescription = isWorkerDeposit
        ? `${targetMention}, **$${options.amount.toFixed(2)} USD** has been added to your worker deposit!`
        : `${targetMention}, **$${options.amount.toFixed(2)} USD** has been added to your wallet!`;
    const fieldLabel = isWorkerDeposit ? "Deposit" : "Balance";

    const notificationEmbed = new EmbedBuilder()
        .setAuthor({
            name: "Morita Wallet",
            iconURL: interaction.client.user?.displayAvatarURL() || undefined
        })
        .setTitle(embedTitle)
        .setDescription(embedDescription)
        .addFields(
            {
                name: `Previous ${fieldLabel}`,
                value: `\`\`\`diff\n- $${previousValue} USD\n\`\`\``,
                inline: true,
            },
            {
                name: `New ${fieldLabel}`,
                value: `\`\`\`diff\n+ $${newValue} USD\n\`\`\``,
                inline: true,
            },
            {
                name: "Transaction Type",
                value: `\`${options.transactionType}\``,
                inline: true,
            }
        )
        .setColor(isWorkerDeposit ? 0x5865f2 : 0xffd700)
        .setTimestamp()
        .setThumbnail(userAvatar);

    const transactionDetails = buildTransactionDetails(options);
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

async function getUserAvatar(client: any, targetInfo: any): Promise<string | null> {
    try {
        if (targetInfo.user) {
            return targetInfo.user.displayAvatarURL();
        }
        const fetchedUser = await client.users.fetch(targetInfo.discordId);
        return fetchedUser.displayAvatarURL();
    } catch {
        return null;
    }
}

function buildTransactionDetails(options: any): string[] {
    const details = [];
    if (options.paymentMethod) {
        details.push(`💳 **Payment Method:** ${options.paymentMethod}`);
    }
    if (options.reference) {
        details.push(`🔢 **Reference:** ${options.reference}`);
    }
    if (options.note) {
        details.push(`📝 **Note:** ${options.note}`);
    }
    return details;
}
