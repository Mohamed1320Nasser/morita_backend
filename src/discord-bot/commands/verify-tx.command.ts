import {
    SlashCommandBuilder,
    CommandInteraction,
    PermissionFlagsBits,
    EmbedBuilder,
} from "discord.js";
import { Command } from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

export default {
    data: new SlashCommandBuilder()
        .setName("verify-tx")
        .setDescription("Verify a blockchain transaction (Support/Admin only)")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option =>
            option
                .setName("currency")
                .setDescription("Cryptocurrency type")
                .setRequired(true)
                .addChoices(
                    { name: "BTC (Bitcoin)", value: "BTC" },
                    { name: "LTC (Litecoin)", value: "LTC" },
                    { name: "ETH (Ethereum)", value: "ETH" },
                    { name: "USDT (Tether)", value: "USDT" },
                    { name: "USDC (USD Coin)", value: "USDC" },
                    { name: "SOL (Solana)", value: "SOL" },
                    { name: "XRP (Ripple)", value: "XRP" }
                )
        )
        .addStringOption(option =>
            option
                .setName("txid")
                .setDescription("Transaction ID/Hash")
                .setRequired(true)
                .setMinLength(10)
                .setMaxLength(100)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            // Check permission
            if (!hasPermission(interaction)) {
                await interaction.editReply({
                    content: "❌ You do not have permission to use this command. Only Support and Admin can verify transactions.",
                });
                return;
            }

            const currency = interaction.options.get("currency")?.value as string;
            const txid = (interaction.options.get("txid")?.value as string).trim();

            logger.info(`[VerifyTx] ${interaction.user.tag} verifying ${currency} transaction: ${txid}`);

            // Show loading message
            const loadingEmbed = new EmbedBuilder()
                .setTitle("🔍 Verifying Transaction...")
                .setDescription(`Checking ${currency} blockchain for transaction:\n\`${txid}\``)
                .setColor(0x5865f2)
                .setTimestamp();

            await interaction.editReply({ embeds: [loadingEmbed.toJSON() as any] });

            // Call API to verify transaction
            const response: any = await discordApiClient.get(`/blockchain/verify/${currency}/${txid}`);
            const txData = response.data || response;

            // Get verifier info
            const verifierRole = getVerifierRole(interaction);
            const verifierInfo = {
                tag: interaction.user.tag,
                role: verifierRole,
                id: interaction.user.id,
            };

            // Build result embed
            const resultEmbed = buildResultEmbed(txData, currency, txid, verifierInfo);

            await interaction.editReply({ embeds: [resultEmbed.toJSON() as any] });

            logger.info(`[VerifyTx] Transaction ${txid}: ${txData.status}, ${txData.amount} ${currency}`);
        } catch (error: any) {
            logger.error("[VerifyTx] Error:", error);

            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Verification Failed")
                .setDescription(`Failed to verify transaction.\n\n**Error:** ${error.message || "Unknown error"}`)
                .setColor(0xed4245)
                .setTimestamp();

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed.toJSON() as any] });
            } else {
                await interaction.reply({ embeds: [errorEmbed.toJSON() as any], ephemeral: true });
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

function getVerifierRole(interaction: CommandInteraction): string {
    const member = interaction.member;
    const isAdmin = member && "roles" in member && (member.roles as any).cache?.has(discordConfig.adminRoleId);
    const isSupport = member && "roles" in member && (member.roles as any).cache?.has(discordConfig.supportRoleId);

    if (isAdmin) return "Admin";
    if (isSupport) return "Support";
    return "Staff";
}

interface VerifierInfo {
    tag: string;
    role: string;
    id: string;
}

function buildResultEmbed(txData: any, currency: string, txid: string, verifier: VerifierInfo): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTimestamp()
        .setFooter({ text: `Verified by ${verifier.tag} (${verifier.role})` });

    // Status-based styling
    switch (txData.status) {
        case "confirmed":
            embed
                .setTitle("✅ Transaction Confirmed")
                .setColor(0x57f287)
                .setDescription(`The ${currency} transaction has been **confirmed** on the blockchain.`);
            break;
        case "pending":
            embed
                .setTitle("⏳ Transaction Pending")
                .setColor(0xfee75c)
                .setDescription(`The ${currency} transaction is **pending** confirmation.`);
            break;
        case "not_found":
            embed
                .setTitle("❓ Transaction Not Found")
                .setColor(0xed4245)
                .setDescription(`No transaction found with this ID on the ${txData.network} network.\n\nPlease check:\n• Transaction ID is correct\n• Correct cryptocurrency selected\n• Transaction has been broadcast`);
            return embed;
        case "error":
            embed
                .setTitle("⚠️ Verification Error")
                .setColor(0xed4245)
                .setDescription(`Could not verify this transaction. The blockchain API may be temporarily unavailable.`);
            return embed;
        default:
            embed
                .setTitle("❓ Unknown Status")
                .setColor(0x99aab5)
                .setDescription(`Transaction status: ${txData.status}`);
    }

    // Add transaction details
    const fields = [];

    // Total Received (highlighted)
    if (txData.totalReceived > 0) {
        const usdStr = txData.totalReceivedUsd > 0
            ? `\n≈ $${txData.totalReceivedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
            : '';
        fields.push({
            name: "💰 Total Received",
            value: `\`\`\`${txData.totalReceivedFormatted} ${currency}${usdStr}\`\`\``,
            inline: false,
        });
    }

    // Total Input
    if (txData.totalInput > 0) {
        const inputUsd = txData.totalInputUsd > 0
            ? ` ($${txData.totalInputUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
            : '';
        fields.push({
            name: "📥 Total Input",
            value: `\`${txData.totalInputFormatted} ${currency}\`${inputUsd}`,
            inline: true,
        });
    }

    // Fee
    if (txData.fee > 0) {
        const feeUsd = txData.feeUsd > 0
            ? ` ($${txData.feeUsd.toFixed(4)})`
            : '';
        fields.push({
            name: "⛽ Fee",
            value: `\`${txData.feeFormatted} ${currency}\`${feeUsd}`,
            inline: true,
        });
    }

    // Confirmations
    fields.push({
        name: "🔢 Confirmations",
        value: `\`${txData.confirmations}\``,
        inline: true,
    });

    // Network
    fields.push({
        name: "🌐 Network",
        value: `\`${txData.network}\``,
        inline: true,
    });

    // Inputs/Outputs count
    if (txData.inputCount > 0 || txData.outputCount > 0) {
        fields.push({
            name: "🔄 Inputs/Outputs",
            value: `\`${txData.inputCount || 0} inputs / ${txData.outputCount || 0} outputs\``,
            inline: true,
        });
    }

    // Timestamp
    if (txData.timestamp) {
        const date = new Date(txData.timestamp);
        fields.push({
            name: "🕐 Time",
            value: `<t:${Math.floor(date.getTime() / 1000)}:F>`,
            inline: true,
        });
    }

    // Block Height
    if (txData.blockHeight) {
        fields.push({
            name: "📦 Block",
            value: `\`${txData.blockHeight.toLocaleString()}\``,
            inline: true,
        });
    }

    embed.addFields(fields);

    // Show recipients (outputs)
    if (txData.outputs && txData.outputs.length > 0) {
        const outputsList = txData.outputs.slice(0, 3).map((o: any) =>
            `\`${truncateAddress(o.address)}\` → **${o.amountFormatted} ${currency}**`
        ).join("\n");
        const more = txData.outputs.length > 3 ? `\n_...and ${txData.outputs.length - 3} more_` : "";
        embed.addFields({
            name: `📤 Recipients (${txData.outputCount})`,
            value: outputsList + more,
            inline: false,
        });
    }

    // Show top senders (inputs)
    if (txData.inputs && txData.inputs.length > 0) {
        const inputsList = txData.inputs.slice(0, 3).map((i: any) =>
            `\`${truncateAddress(i.address)}\` → **${i.amountFormatted} ${currency}**`
        ).join("\n");
        const more = txData.inputs.length > 3 ? `\n_...and ${txData.inputs.length - 3} more addresses_` : "";
        embed.addFields({
            name: `📥 Senders (${txData.inputs.length} addresses)`,
            value: inputsList + more,
            inline: false,
        });
    }

    // Transaction ID and Explorer Link
    embed.addFields({
        name: "🔗 Transaction ID",
        value: `\`${txid}\`\n[View on Explorer](${txData.explorerUrl})`,
        inline: false,
    });

    // Verified by (with role badge)
    const roleEmoji = verifier.role === "Admin" ? "👑" : "🛡️";
    embed.addFields({
        name: `${roleEmoji} Verified By`,
        value: `<@${verifier.id}> (**${verifier.role}**)`,
        inline: false,
    });

    return embed;
}

function truncateAddress(address: string): string {
    if (!address || address.length < 20) return address;
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
}
