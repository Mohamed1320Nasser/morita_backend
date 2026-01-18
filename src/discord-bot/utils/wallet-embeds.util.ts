import { EmbedBuilder, User } from "discord.js";

export interface WalletData {
    walletId?: string;
    balance: number;
    pendingBalance: number;
    deposit?: number;
    eligibilityBalance?: number;
    currency: string;
    walletType?: string;
    hasWallet: boolean;
}

export interface TransactionData {
    amount: string | number;
    type: string;
    createdAt: string;
    balanceBefore: string | number;
    balanceAfter: string | number;
    status?: string;
    reference?: string;
    notes?: string;
}

export interface WalletEmbedOptions {
    isAdminView?: boolean;
    targetUser?: User | null;
    targetDiscordId?: string;
}

/**
 * Create a wallet balance embed
 */
export function createBalanceEmbed(
    data: WalletData,
    options: WalletEmbedOptions = {}
): EmbedBuilder {
    const { isAdminView = false, targetUser, targetDiscordId } = options;

    if (!data.hasWallet) {
        const walletOwnerText = isAdminView && targetDiscordId
            ? `<@${targetDiscordId}> doesn't have a wallet yet.`
            : "You don't have a wallet yet.";

        const embed = new EmbedBuilder()
            .setTitle(isAdminView ? "💰 User Wallet" : "💰 Your Wallet")
            .setDescription(
                walletOwnerText + "\n\n" +
                "A wallet will be created automatically when they receive their first deposit."
            )
            .setColor(0x5865f2)
            .setTimestamp();

        if (isAdminView && targetUser) {
            embed.setThumbnail(targetUser.displayAvatarURL());
            embed.addFields({
                name: "👤 User",
                value: `${targetUser.tag}\nDiscord ID: \`${targetDiscordId}\``,
                inline: false,
            });
        }

        return embed;
    }

    const balance = parseFloat(String(data.balance)).toFixed(2);
    const pendingBalance = parseFloat(String(data.pendingBalance)).toFixed(2);
    const deposit = parseFloat(String(data.deposit || 0)).toFixed(2);
    const eligibilityBalance = parseFloat(
        String(data.eligibilityBalance || (parseFloat(deposit) + parseFloat(balance)))
    ).toFixed(2);
    const isWorker = data.walletType === "WORKER";

    const embed = new EmbedBuilder()
        .setTitle(isAdminView ? "💰 User Wallet" : "💰 Your Wallet")
        .setColor(0x57f287)
        .setTimestamp()
        .setFooter({
            text: `Wallet ID: ${data.walletId || 'N/A'} • Type: ${data.walletType || 'CUSTOMER'}`
        });

    if (isAdminView && targetUser && targetDiscordId) {
        embed.setThumbnail(targetUser.displayAvatarURL());
        embed.setDescription(`Viewing wallet for <@${targetDiscordId}>`);
        embed.addFields({
            name: "👤 User Information",
            value: `**Username:** ${targetUser.tag}\n**Discord ID:** \`${targetDiscordId}\``,
            inline: false,
        });
    }

    // Balance section - always show all fields
    let balanceText = `\`\`\`yml\n`;
    balanceText += `Balance:           $${balance} ${data.currency}\n`;
    balanceText += `Pending:           $${pendingBalance} ${data.currency}\n`;
    balanceText += `Deposit:           $${deposit} ${data.currency}\n`;
    balanceText += `\`\`\``;

    embed.addFields({
        name: "📊 Balance",
        value: balanceText,
        inline: false,
    });

    // Worker-specific eligibility info
    if (isWorker) {
        embed.addFields({
            name: "🔐 Job Claiming Eligibility",
            value: `\`\`\`yml\nTotal Eligibility: $${eligibilityBalance} ${data.currency}\n\`\`\``,
            inline: false,
        });
    }

    return embed;
}

/**
 * Create a transaction history embed
 */
export function createTransactionsEmbed(
    transactions: TransactionData[],
    options: WalletEmbedOptions = {}
): EmbedBuilder {
    const { isAdminView = false, targetUser, targetDiscordId } = options;

    if (transactions.length === 0) {
        const noTxDescription = isAdminView && targetDiscordId
            ? `No transactions found for <@${targetDiscordId}>.`
            : "No transactions found.";

        const embed = new EmbedBuilder()
            .setTitle("📜 Transaction History")
            .setDescription(noTxDescription)
            .setColor(0x5865f2)
            .setTimestamp();

        if (isAdminView && targetUser) {
            embed.setThumbnail(targetUser.displayAvatarURL());
        }

        return embed;
    }

    const txDescription = isAdminView && targetDiscordId
        ? `Showing ${transactions.length} recent transaction(s) for <@${targetDiscordId}>`
        : `Showing ${transactions.length} recent transaction(s)`;

    const embed = new EmbedBuilder()
        .setTitle("📜 Transaction History")
        .setDescription(txDescription)
        .setColor(0x5865f2)
        .setTimestamp();

    if (isAdminView && targetUser && targetDiscordId) {
        embed.setThumbnail(targetUser.displayAvatarURL());
        embed.addFields({
            name: "👤 User",
            value: `${targetUser.tag} • \`${targetDiscordId}\``,
            inline: false,
        });
    }

    // Add transaction fields (max 10)
    for (let i = 0; i < Math.min(transactions.length, 10); i++) {
        const tx = transactions[i];
        const amount = parseFloat(String(tx.amount));
        const sign = amount >= 0 ? "+" : "-";
        const date = new Date(tx.createdAt);

        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const timeStr = date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const typeFormatted = tx.type.replace(/_/g, ' ');

        let txDetails = `\`\`\`yml\n`;
        txDetails += `Amount:        ${sign}$${Math.abs(amount).toFixed(2)} USD\n`;
        txDetails += `Type:          ${typeFormatted}\n`;
        txDetails += `Date:          ${dateStr} at ${timeStr}\n`;
        txDetails += `Balance:       $${parseFloat(String(tx.balanceBefore)).toFixed(2)} → $${parseFloat(String(tx.balanceAfter)).toFixed(2)}\n`;

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

    return embed;
}
