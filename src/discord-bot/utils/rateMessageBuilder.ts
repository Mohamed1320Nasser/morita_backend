import { EmbedBuilder, AttachmentBuilder } from "discord.js";

interface PaymentMethodRate {
    name: string;
    icon?: string;
    currency?: string;
    upchargePercent: number;
    buyRate: number;
    sellRate: number;
}

interface RateData {
    baseBuyRate: number;
    baseSellRate: number;
    crypto: PaymentMethodRate[];
    manual: PaymentMethodRate[];
}

const CRYPTO_ICONS: Record<string, string> = {
    BTC: "₿",
    LTC: "Ł",
    ETH: "Ξ",
    USDT: "₮",
    USDC: "💵",
    SOL: "◎",
    XRP: "✕",
};

const PAYMENT_ICONS: Record<string, string> = {
    PAYPAL: "💙",
    CASHAPP: "💚",
    VENMO: "💙",
    ZELLE: "💜",
    WISE: "💚",
    REVOLUT: "⚫",
    E_TRANSFER: "🔷",
    OTHER: "💳",
};

export function buildRateEmbed(data: RateData): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("💰 GP Rates")
        .setColor(0xf1c40f) // Gold color
        .setTimestamp();

    // Build description with base rates
    let description = "**GP Rates**\n\n";
    description += `💵 **Buy**\n`;
    description += `\`\`\`\n$${data.baseBuyRate.toFixed(2)}\n\`\`\`\n`;
    description += `💸 **Sell**\n`;
    description += `\`\`\`\n$${data.baseSellRate.toFixed(2)}\n\`\`\`\n\n`;
    description += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    description += `💳 **Rates - Other Methods:**\n\n`;

    // Add crypto rates
    if (data.crypto.length > 0) {
        description += `**🪙 Crypto**\n`;
        for (const crypto of data.crypto) {
            const icon = CRYPTO_ICONS[crypto.currency || ""] || "🪙";
            const buyPrice = crypto.buyRate.toFixed(3);
            const upcharge = crypto.upchargePercent > 0 ? ` (+${crypto.upchargePercent}%)` : "";
            description += `${icon} ${crypto.currency} **$${buyPrice}**${upcharge}\n`;
        }
        description += `\n`;
    }

    // Add manual payment methods
    if (data.manual.length > 0) {
        for (const payment of data.manual) {
            const icon = payment.icon || "💳";
            const buyPrice = payment.buyRate.toFixed(3);
            const upcharge = payment.upchargePercent > 0 ? ` (+${payment.upchargePercent}%)` : "";
            description += `${icon} ${payment.name} **$${buyPrice}**${upcharge}\n`;
        }
    }

    description += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
    description += `**Disclaimer:** Displayed rates are automated estimates based on aggregate prices from other marketplaces. Actual rates may vary.`;

    embed.setDescription(description);

    return embed;
}

export function buildRateEmbedSimple(data: RateData): { embeds: any[] } {
    const embed = new EmbedBuilder()
        .setTitle("💰 GP Rates")
        .setColor(0xf1c40f)
        .setDescription(
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `**💵 Buy Rate**\n` +
            `\`\`\`\n$${data.baseBuyRate.toFixed(2)}\n\`\`\`\n` +
            `**💸 Sell Rate**\n` +
            `\`\`\`\n$${data.baseSellRate.toFixed(2)}\n\`\`\`\n` +
            `━━━━━━━━━━━━━━━━━━━━`
        )
        .setTimestamp();

    // Add crypto methods field
    if (data.crypto.length > 0) {
        let cryptoText = "";
        for (const crypto of data.crypto) {
            const icon = CRYPTO_ICONS[crypto.currency || ""] || "🪙";
            const buyPrice = crypto.buyRate.toFixed(3);
            const upcharge = crypto.upchargePercent > 0 ? ` (+${crypto.upchargePercent}%)` : "";
            cryptoText += `${icon} **${crypto.currency}** $${buyPrice}${upcharge}\n`;
        }
        embed.addFields({
            name: "🪙 Crypto Payments",
            value: cryptoText || "No crypto methods available",
            inline: false,
        });
    }

    // Add manual payment methods field
    if (data.manual.length > 0) {
        let manualText = "";
        for (const payment of data.manual) {
            const icon = payment.icon || "💳";
            const buyPrice = payment.buyRate.toFixed(3);
            const upcharge = payment.upchargePercent > 0 ? ` (+${payment.upchargePercent}%)` : "";
            manualText += `${icon} **${payment.name}** $${buyPrice}${upcharge}\n`;
        }
        embed.addFields({
            name: "💳 Other Payment Methods",
            value: manualText || "No payment methods available",
            inline: false,
        });
    }

    embed.addFields({
        name: "\u200B",
        value:
            "**⚠️ Disclaimer**\n" +
            "Displayed rates are automated estimates based on aggregate prices from other marketplaces. Actual rates may vary.",
        inline: false,
    });

    return { embeds: [embed.toJSON() as any] };
}
