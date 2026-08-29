import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
} from "discord.js";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";
import { applyBrandThumbnail, applyCalculatorBranding } from "../utils/priceEmbed";

const CURRENCY_ICONS: Record<string, string> = {
    BTC: "₿",
    LTC: "🪙",
    ETH: "⟠",
    USDT: "💵",
    USDC: "💲",
    SOL: "◎",
    XRP: "✕",
};

const PAYMENT_ICONS: Record<string, string> = {
    PAYPAL: "💳",
    ZELLE: "🏦",
    WISE: "💸",
    REVOLUT: "🔄",
    E_TRANSFER: "📧",
    CASHAPP: "💵",
    VENMO: "📱",
    OTHER: "💰",
};

function formatPaymentBlock(type: string, details: Record<string, string>): string {
    const lines: string[] = [];

    switch (type) {
        case "PAYPAL":
            if (details.email) lines.push(`Email:      ${details.email}`);
            if (details.paypalMe) lines.push(`PayPal.Me:  paypal.me/${details.paypalMe}`);
            break;
        case "ZELLE":
            if (details.email) lines.push(`Email:      ${details.email}`);
            if (details.phone) lines.push(`Phone:      ${details.phone}`);
            if (details.bankName) lines.push(`Bank:       ${details.bankName}`);
            break;
        case "WISE":
            if (details.email) lines.push(`Email:      ${details.email}`);
            if (details.accountHolder) lines.push(`Holder:     ${details.accountHolder}`);
            break;
        case "REVOLUT":
            if (details.username) lines.push(`Username:   ${details.username}`);
            if (details.phone) lines.push(`Phone:      ${details.phone}`);
            break;
        case "E_TRANSFER":
            if (details.email) lines.push(`Email:      ${details.email}`);
            if (details.securityQuestion) lines.push(`Question:   ${details.securityQuestion}`);
            if (details.securityAnswer) lines.push(`Answer:     ${details.securityAnswer}`);
            break;
        case "CASHAPP":
            if (details.cashtag) lines.push(`Cashtag:    ${details.cashtag}`);
            break;
        case "VENMO":
            if (details.username) lines.push(`Username:   ${details.username}`);
            break;
        case "OTHER":
            if (details.customLabel) lines.push(`${details.customLabel}:`);
            if (details.customValue) lines.push(`${details.customValue}`);
            break;
        default:
            for (const [key, value] of Object.entries(details)) {
                if (value) lines.push(`${key}:      ${value}`);
            }
    }

    return lines.length > 0 ? lines.join("\n") : "Contact support";
}

export const data = new SlashCommandBuilder()
    .setName("payment-methods")
    .setDescription("View all available payment methods (Crypto & Other)");

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Fetch crypto wallets
        const wallets = await prisma.cryptoWallet.findMany({
            where: { isActive: true },
            orderBy: [{ currency: "asc" }, { createdAt: "desc" }],
        });

        // Fetch manual payment options
        const paymentOptions = await prisma.manualPaymentOption.findMany({
            where: { isActive: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        });

        if (wallets.length === 0 && paymentOptions.length === 0) {
            await interaction.editReply({
                content: "No payment methods are currently available. Please contact support.",
            });
            return;
        }

        const embeds: EmbedBuilder[] = [];

        // Crypto wallets embed
        if (wallets.length > 0) {
            const cryptoEmbed = new EmbedBuilder()
                .setTitle("🔗 Cryptocurrency Payments")
                .setDescription("Send payment to one of the wallet addresses below:")
                .setColor(0xfca311);

            const walletsByCurrency: Record<string, typeof wallets> = {};
            for (const wallet of wallets) {
                if (!walletsByCurrency[wallet.currency]) {
                    walletsByCurrency[wallet.currency] = [];
                }
                walletsByCurrency[wallet.currency].push(wallet);
            }

            for (const [currency, currencyWallets] of Object.entries(walletsByCurrency)) {
                const icon = CURRENCY_ICONS[currency] || "💰";
                const wallet = currencyWallets[0];
                const walletsText = currencyWallets.map(w => w.address).join("\n");
                const upchargeText = wallet.upchargePercent > 0
                    ? ` (+${wallet.upchargePercent}% fee)`
                    : "";

                cryptoEmbed.addFields({
                    name: `${icon} ${currency}${upchargeText}`,
                    value: `\`\`\`fix\n${walletsText}\n\`\`\``,
                    inline: false,
                });
            }

            embeds.push(cryptoEmbed);
        }

        // Manual payment options embed
        if (paymentOptions.length > 0) {
            const manualEmbed = new EmbedBuilder()
                .setTitle("💵 Other Payment Methods")
                .setDescription("Send payment using one of the methods below:")
                .setColor(0xfca311);

            for (const option of paymentOptions) {
                const icon = option.icon || PAYMENT_ICONS[option.type] || "💳";
                const details = option.details as Record<string, string>;
                const formattedBlock = formatPaymentBlock(option.type, details);
                const upchargeText = option.upchargePercent > 0
                    ? ` (+${option.upchargePercent}% fee)`
                    : "";

                const notes = (option.instructions || "").trim();
                const block = `\`\`\`yaml\n${formattedBlock}\n\`\`\``;
                const room = 1024 - block.length - 4;
                const notesText = notes && room > 16
                    ? `\n> ${notes.substring(0, room).replace(/\n/g, "\n> ")}`
                    : "";

                manualEmbed.addFields({
                    name: `${icon} ${option.name}${upchargeText}`,
                    value: `${block}${notesText}`,
                    inline: false,
                });
            }

            embeds.push(manualEmbed);
        }

        // Add footer to last embed
        if (embeds.length > 0) {
            embeds[embeds.length - 1].setFooter({
                text: "Send payment proof after completing transaction"
            }).setTimestamp();

            // Discord renders one banner per message, so it goes on the last
            // embed and the logo on the first.
            applyBrandThumbnail(embeds[0]);
            applyCalculatorBranding(embeds[embeds.length - 1]);
        }

        await interaction.editReply({
            embeds: embeds.map(e => e.toJSON() as any),
        });

        logger.info(`[PaymentMethods] Command executed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("[PaymentMethods] Error:", error);
        await interaction.editReply({
            content: "Failed to load payment methods. Please try again or contact support.",
        });
    }
}
