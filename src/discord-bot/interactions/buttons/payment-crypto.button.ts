import { ButtonInteraction, EmbedBuilder } from "discord.js";
import prisma from "../../../common/prisma/client";
import logger from "../../../common/loggers";

// Currency icons
const CURRENCY_ICONS: Record<string, string> = {
    BTC: "₿",
    LTC: "🪙",
    ETH: "⟠",
    USDT: "💵",
    USDC: "💲",
    SOL: "◎",
    XRP: "✕",
};

export async function handlePaymentCrypto(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Fetch active crypto wallets
        const wallets = await prisma.cryptoWallet.findMany({
            where: { isActive: true },
            orderBy: [{ currency: "asc" }, { createdAt: "desc" }],
        });

        if (wallets.length === 0) {
            await interaction.reply({
                content: "No cryptocurrency payment options are currently available. Please try other payment methods.",
                ephemeral: true,
            });
            return;
        }

        // Build embed with wallet information
        const embed = new EmbedBuilder()
            .setTitle("🔗 Cryptocurrency Wallets")
            .setDescription("Select a wallet address below to send your payment.")
            .setColor(0xF7931A) // Bitcoin orange color
            .setTimestamp();

        // Group wallets by currency
        const walletsByCurrency: Record<string, typeof wallets> = {};
        for (const wallet of wallets) {
            if (!walletsByCurrency[wallet.currency]) {
                walletsByCurrency[wallet.currency] = [];
            }
            walletsByCurrency[wallet.currency].push(wallet);
        }

        // Add fields for each currency
        let hasUpcharge = false;

        for (const [currency, currencyWallets] of Object.entries(walletsByCurrency)) {
            const icon = CURRENCY_ICONS[currency] || "💰";
            const wallet = currencyWallets[0];

            const walletsText = currencyWallets.map(w => w.address).join("\n");
            const upchargeText = wallet.upchargePercent > 0
                ? ` (+${wallet.upchargePercent}% fee)`
                : "";

            if (wallet.upchargePercent > 0) {
                hasUpcharge = true;
            }

            embed.addFields({
                name: `${icon} ${currency}${upchargeText}`,
                value: `\`\`\`fix\n${walletsText}\n\`\`\``,
                inline: false,
            });
        }

        embed.setFooter({
            text: hasUpcharge
                ? "Tap address to copy • Fees are added to your total • Open a ticket after payment"
                : "Tap address to copy • Open a ticket after payment"
        });

        await interaction.reply({
            embeds: [embed.toJSON() as any],
            ephemeral: true,
        });

        logger.info(`[PaymentCrypto] Crypto payment info shown to ${interaction.user.tag}`);
    } catch (error) {
        logger.error("[PaymentCrypto] Error:", error);
        await interaction.reply({
            content: "Failed to load cryptocurrency payment options. Please try again or contact support.",
            ephemeral: true,
        });
    }
}
