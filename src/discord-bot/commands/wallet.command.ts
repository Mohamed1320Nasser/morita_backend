import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
    TextChannel,
    User,
} from "discord.js";
import { Command } from "../types/discord.types";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";
import { discordConfig } from "../config/discord.config";
import { getTicketService } from "../services/ticket.service";

export default {
    data: new SlashCommandBuilder()
        .setName("wallet")
        .setDescription("View wallet balance and recent transactions")
        .addStringOption((option) =>
            option
                .setName("action")
                .setDescription("What to view")
                .setRequired(false)
                .addChoices(
                    { name: "Balance", value: "balance" },
                    { name: "Transactions", value: "transactions" }
                )
        )
        .addUserOption((option) =>
            option
                .setName("user")
                .setDescription("Target user (Support/Admin only - auto-detected in tickets)")
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const action = (interaction.options.get("action")?.value as string) || "balance";

            // Get target user (admin feature)
            const specifiedUser = interaction.options.get("user")?.user as User | undefined;
            const targetUserInfo = await getTargetUser(interaction, specifiedUser);

            // Permission check: If checking someone else's wallet, must be Support/Admin
            const isCheckingOtherUser = targetUserInfo.discordId !== interaction.user.id;
            if (isCheckingOtherUser && !hasAdminPermission(interaction)) {
                await interaction.editReply({
                    content: "❌ **Permission Denied**\n\nOnly Support and Admin can view other users' wallets.\n\nUse `/wallet` without the user parameter to view your own balance.",
                });
                return;
            }

            const discordId = targetUserInfo.discordId;

            if (action === "balance") {
                // Get wallet balance
                const response: any = await discordApiClient.get(
                    `/discord/wallets/balance/${discordId}`
                );

                logger.info(`[Wallet Command] Raw response: ${JSON.stringify(response)}`);

                // Extract the actual wallet data from the nested response structure
                // HttpClient interceptor already unwrapped one level
                const responseData = response.data || response;
                const data = responseData.data || responseData;

                logger.info(`[Wallet Command] Parsed data: ${JSON.stringify(data)}`);
                logger.info(`[Wallet Command] hasWallet value: ${data.hasWallet} (type: ${typeof data.hasWallet})`);

                if (!data.hasWallet) {
                    const walletOwnerText = isCheckingOtherUser
                        ? `<@${targetUserInfo.discordId}> doesn't have a wallet yet.`
                        : "You don't have a wallet yet.";

                    const embed = new EmbedBuilder()
                        .setTitle(isCheckingOtherUser ? "💰 User Wallet" : "💰 Your Wallet")
                        .setDescription(
                            walletOwnerText + "\n\n" +
                            "Wallet will be created automatically when they receive their first deposit."
                        )
                        .setColor(0x5865f2)
                        .setTimestamp();

                    if (isCheckingOtherUser && targetUserInfo.user) {
                        embed.setThumbnail(targetUserInfo.user.displayAvatarURL());
                        embed.addFields({
                            name: "👤 User",
                            value: `${targetUserInfo.user.tag}\nDiscord ID: \`${targetUserInfo.discordId}\``,
                            inline: false,
                        });
                    }

                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                    return;
                }

                const balance = parseFloat(data.balance).toFixed(2);
                const pendingBalance = parseFloat(data.pendingBalance).toFixed(2);
                const deposit = parseFloat(data.deposit || 0).toFixed(2);
                const eligibilityBalance = parseFloat(data.eligibilityBalance || (parseFloat(deposit) + parseFloat(data.balance))).toFixed(2);

                const isWorker = data.walletType === "WORKER";

                const embedTitle = isCheckingOtherUser ? "💰 User Wallet" : "💰 Your Wallet";
                const embed = new EmbedBuilder()
                    .setTitle(embedTitle)
                    .setColor(0x57f287)
                    .setTimestamp()
                    .setFooter({ text: `Wallet ID: ${data.walletId} • Type: ${data.walletType || 'CUSTOMER'}` });

                // Add user info if admin is checking someone else's wallet
                if (isCheckingOtherUser && targetUserInfo.user) {
                    embed.setThumbnail(targetUserInfo.user.displayAvatarURL());
                    embed.setDescription(`Viewing wallet for <@${targetUserInfo.discordId}>`);
                    embed.addFields({
                        name: "👤 User Information",
                        value: `**Username:** ${targetUserInfo.user.tag}\n**Discord ID:** \`${targetUserInfo.discordId}\``,
                        inline: false,
                    });
                }

                // Balance breakdown
                let balanceText = `\`\`\`yml\n`;
                balanceText += `Balance:           $${balance} ${data.currency}\n`;
                if (parseFloat(data.pendingBalance) > 0) {
                    balanceText += `Pending (Locked):  $${pendingBalance} ${data.currency}\n`;
                }
                balanceText += `\`\`\``;

                embed.addFields({
                    name: "📊 Balance",
                    value: balanceText,
                    inline: false,
                });

                // Add worker deposit info if applicable
                if (isWorker) {
                    let depositText = `\`\`\`yml\n`;
                    depositText += `Worker Deposit:    $${deposit} ${data.currency}\n`;
                    depositText += `Balance:           $${balance} ${data.currency}\n`;
                    depositText += `─────────────────────────────\n`;
                    depositText += `Total Eligibility: $${eligibilityBalance} ${data.currency}\n`;
                    depositText += `\`\`\``;

                    embed.addFields({
                        name: "🔐 Job Claiming Eligibility",
                        value: depositText,
                        inline: false,
                    });

                    embed.addFields({
                        name: "ℹ️ About Worker Deposit",
                        value: "Your worker deposit increases your job claiming eligibility. The total eligibility (deposit + available balance) determines which jobs you can claim.",
                        inline: false,
                    });
                } else {
                    // Add info about pending balance for non-workers
                    if (parseFloat(data.pendingBalance) > 0) {
                        embed.addFields({
                            name: "ℹ️ Pending Balance",
                            value: "Pending balance is locked for active orders and will be released upon completion.",
                            inline: false,
                        });
                    }
                }

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else if (action === "transactions") {
                // Get recent transactions
                const response: any = await discordApiClient.get(
                    `/discord/wallets/transactions/${discordId}`,
                    { params: { limit: 10 } }
                );

                // Extract the actual transaction data from the nested response structure
                // HttpClient interceptor already unwrapped one level
                const responseData = response.data || response;
                const data = responseData.data || responseData;
                const transactions = data.list || [];

                if (transactions.length === 0) {
                    const noTxDescription = isCheckingOtherUser
                        ? `No transactions found for <@${targetUserInfo.discordId}>.`
                        : "No transactions found.";

                    const embed = new EmbedBuilder()
                        .setTitle("📜 Transaction History")
                        .setDescription(noTxDescription)
                        .setColor(0x5865f2)
                        .setTimestamp();

                    if (isCheckingOtherUser && targetUserInfo.user) {
                        embed.setThumbnail(targetUserInfo.user.displayAvatarURL());
                    }

                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                    return;
                }

                const txDescription = isCheckingOtherUser
                    ? `Showing ${transactions.length} recent transaction(s) for <@${targetUserInfo.discordId}>`
                    : `Showing ${transactions.length} recent transaction(s)`;

                const embed = new EmbedBuilder()
                    .setTitle("📜 Transaction History")
                    .setDescription(txDescription)
                    .setColor(0x5865f2)
                    .setTimestamp();

                // Add user info if admin is checking someone else's transactions
                if (isCheckingOtherUser && targetUserInfo.user) {
                    embed.setThumbnail(targetUserInfo.user.displayAvatarURL());
                    embed.addFields({
                        name: "👤 User",
                        value: `${targetUserInfo.user.tag} • \`${targetUserInfo.discordId}\``,
                        inline: false,
                    });
                }

                // Build transaction list with clean formatting
                for (let i = 0; i < Math.min(transactions.length, 10); i++) {
                    const tx = transactions[i];
                    const amount = parseFloat(tx.amount);
                    const sign = amount >= 0 ? "+" : "-";
                    const date = new Date(tx.createdAt);

                    // Format date and time
                    const dateStr = date.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    const timeStr = date.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });

                    // Format transaction type
                    const typeFormatted = tx.type.replace(/_/g, ' ');

                    // Build clean transaction details using code block
                    let txDetails = `\`\`\`yml\n`;
                    txDetails += `Amount:        ${sign}$${Math.abs(amount).toFixed(2)} USD\n`;
                    txDetails += `Type:          ${typeFormatted}\n`;
                    txDetails += `Date:          ${dateStr} at ${timeStr}\n`;
                    txDetails += `Balance:       $${parseFloat(tx.balanceBefore).toFixed(2)} → $${parseFloat(tx.balanceAfter).toFixed(2)}\n`;

                    if (tx.status && tx.status !== 'COMPLETED') {
                        txDetails += `Status:        ${tx.status}\n`;
                    }

                    if (tx.reference) {
                        txDetails += `Reference:     ${tx.reference}\n`;
                    }

                    if (tx.notes) {
                        txDetails += `Notes:         ${tx.notes}\n`;
                    }

                    txDetails += `\`\`\``;

                    embed.addFields({
                        name: `Transaction #${i + 1}`,
                        value: txDetails,
                        inline: false,
                    });
                }

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            }

            logger.info(`Wallet ${action} viewed by ${interaction.user.tag}${isCheckingOtherUser ? ` for user ${discordId}` : ''}`);
        } catch (error) {
            logger.error("Error executing wallet command:", error);

            const embed = new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription("Failed to fetch wallet information. Please try again later.")
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

/**
 * Check if user has Support or Admin role
 */
function hasAdminPermission(interaction: CommandInteraction): boolean {
    const member = interaction.member;
    if (!member || !("roles" in member)) return false;

    const roles = (member.roles as any).cache;
    const isSupport = roles?.has(discordConfig.supportRoleId);
    const isAdmin = roles?.has(discordConfig.adminRoleId);

    return isSupport || isAdmin;
}

/**
 * Get target user for wallet check
 * Priority: 1) Specified user, 2) Ticket customer, 3) Command user
 */
async function getTargetUser(
    interaction: CommandInteraction,
    specifiedUser: User | undefined
): Promise<{ user: User | null; discordId: string }> {
    // If user was specified, use that
    if (specifiedUser) {
        return {
            user: specifiedUser,
            discordId: specifiedUser.id,
        };
    }

    // Check if in ticket channel and user has admin permissions
    const channel = interaction.channel;
    const isTicketChannel = channel instanceof TextChannel &&
        (channel.name.startsWith(discordConfig.ticketChannelPrefix) || channel.name.startsWith("closed-"));

    if (isTicketChannel && hasAdminPermission(interaction)) {
        try {
            const ticketService = getTicketService(interaction.client);
            const ticket = await ticketService.getTicketByChannelId(channel.id);

            if (ticket) {
                try {
                    const user = await interaction.client.users.fetch(ticket.customerDiscordId);
                    logger.info(`[Wallet] Auto-detected ticket customer: ${user.tag}`);
                    return { user, discordId: ticket.customerDiscordId };
                } catch {
                    return { user: null, discordId: ticket.customerDiscordId };
                }
            }
        } catch (error) {
            logger.warn(`[Wallet] Failed to fetch ticket info:`, error);
        }
    }

    // Default: return the command user
    return {
        user: interaction.user,
        discordId: interaction.user.id,
    };
}
