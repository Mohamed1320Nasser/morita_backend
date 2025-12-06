import {
    SlashCommandBuilder,
    CommandInteraction,
    EmbedBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import axios from "axios";

export default {
    data: new SlashCommandBuilder()
        .setName("wallet")
        .setDescription("View your wallet balance and recent transactions")
        .addStringOption((option) =>
            option
                .setName("action")
                .setDescription("What to view")
                .setRequired(false)
                .addChoices(
                    { name: "Balance", value: "balance" },
                    { name: "Transactions", value: "transactions" }
                )
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const action = (interaction.options.get("action")?.value as string) || "balance";
            const discordId = interaction.user.id;

            // Create API client
            const apiClient = axios.create({
                baseURL: discordConfig.apiBaseUrl,
                timeout: 10000,
            });

            if (action === "balance") {
                // Get wallet balance
                const response = await apiClient.get(
                    `/discord/wallets/balance/${discordId}`
                );

                logger.info(`[Wallet Command] Raw response: ${JSON.stringify(response.data)}`);

                // Extract the actual wallet data from the nested response structure
                const responseData = response.data.data || response.data;
                const data = responseData.data || responseData;

                logger.info(`[Wallet Command] Parsed data: ${JSON.stringify(data)}`);
                logger.info(`[Wallet Command] hasWallet value: ${data.hasWallet} (type: ${typeof data.hasWallet})`);

                if (!data.hasWallet) {
                    const embed = new EmbedBuilder()
                        .setTitle("💰 Your Wallet")
                        .setDescription(
                            "You don't have a wallet yet.\n\n" +
                            "Your wallet will be created automatically when you receive your first deposit."
                        )
                        .setColor(0x5865f2)
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                    return;
                }

                // Format balance display
                const balance = parseFloat(data.balance).toFixed(2);
                const pendingBalance = parseFloat(data.pendingBalance).toFixed(2);
                const availableBalance = (parseFloat(data.balance) - parseFloat(data.pendingBalance)).toFixed(2);

                const embed = new EmbedBuilder()
                    .setTitle("💰 Your Wallet")
                    .setColor(0x57f287)
                    .setTimestamp()
                    .setFooter({ text: `Wallet ID: ${data.walletId}` });

                // Balance breakdown
                let balanceText = `\`\`\`yml\n`;
                balanceText += `Total Balance:     $${balance} ${data.currency}\n`;
                if (parseFloat(data.pendingBalance) > 0) {
                    balanceText += `Pending (Locked):  $${pendingBalance} ${data.currency}\n`;
                    balanceText += `─────────────────────────────\n`;
                    balanceText += `Available:         $${availableBalance} ${data.currency}\n`;
                }
                balanceText += `\`\`\``;

                embed.addFields({
                    name: "📊 Balance",
                    value: balanceText,
                    inline: false,
                });

                // Add info about pending balance
                if (parseFloat(data.pendingBalance) > 0) {
                    embed.addFields({
                        name: "ℹ️ Pending Balance",
                        value: "Pending balance is locked for active orders and will be released upon completion.",
                        inline: false,
                    });
                }

                await interaction.editReply({
                    embeds: [embed.toJSON() as any],
                });
            } else if (action === "transactions") {
                // Get recent transactions
                const response = await apiClient.get(
                    `/discord/wallets/transactions/${discordId}`,
                    { params: { limit: 10 } }
                );

                // Extract the actual transaction data from the nested response structure
                const responseData = response.data.data || response.data;
                const data = responseData.data || responseData;
                const transactions = data.list || [];

                if (transactions.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle("📜 Transaction History")
                        .setDescription("No transactions found.")
                        .setColor(0x5865f2)
                        .setTimestamp();

                    await interaction.editReply({
                        embeds: [embed.toJSON() as any],
                    });
                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle("📜 Transaction History")
                    .setDescription(`Showing ${transactions.length} recent transaction(s)`)
                    .setColor(0x5865f2)
                    .setTimestamp();

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

            logger.info(`Wallet ${action} viewed by ${interaction.user.tag}`);
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
