import { StringSelectMenuInteraction, EmbedBuilder } from "discord.js";
import prisma from "../../../common/prisma/client";
import logger from "../../../common/loggers";
import { applyBrandThumbnail, applyCalculatorBranding } from "../../utils/priceEmbed";

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

export async function handleCalcPaymentSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        await interaction.deferUpdate();

        // Parse amount from customId: calc_payment_select_{amount}
        const amount = parseFloat(interaction.customId.replace("calc_payment_select_", ""));
        const selectedValue = interaction.values[0];

        let methodName = "";
        let methodIcon = "";
        let upchargePercent = 0;
        let address = "";

        if (selectedValue.startsWith("crypto_")) {
            const walletId = selectedValue.replace("crypto_", "");
            const wallet = await prisma.cryptoWallet.findUnique({
                where: { id: walletId },
            });

            if (!wallet) {
                await interaction.editReply({ content: "Payment method not found.", components: [] });
                return;
            }

            methodName = wallet.currency;
            methodIcon = CURRENCY_ICONS[wallet.currency] || "💰";
            upchargePercent = wallet.upchargePercent;
            address = wallet.address;
        } else if (selectedValue.startsWith("manual_")) {
            const paymentId = selectedValue.replace("manual_", "");
            const payment = await prisma.manualPaymentOption.findUnique({
                where: { id: paymentId },
            });

            if (!payment) {
                await interaction.editReply({ content: "Payment method not found.", components: [] });
                return;
            }

            methodName = payment.name;
            methodIcon = payment.icon || PAYMENT_ICONS[payment.type] || "💳";
            upchargePercent = payment.upchargePercent;
        }

        // Calculate amounts
        const upchargeAmount = amount * (upchargePercent / 100);
        const finalAmount = amount + upchargeAmount;

        // Build result embed
        const embed = new EmbedBuilder()
            .setTitle(`${methodIcon} Payment Calculation - ${methodName}`)
            .setColor(0xfca311)
            .setTimestamp();

        let description = "";
        description += `**Original Amount:**\n\`\`\`fix\n$${amount.toFixed(2)}\n\`\`\`\n`;

        if (upchargePercent > 0) {
            description += `**Fee (${upchargePercent}%):**\n\`\`\`diff\n+ $${upchargeAmount.toFixed(2)}\n\`\`\`\n`;
        } else {
            description += `**Fee:**\n\`\`\`diff\n$0.00 (No fee)\n\`\`\`\n`;
        }

        description += `**Final Amount to Pay:**\n\`\`\`fix\n$${finalAmount.toFixed(2)}\n\`\`\``;

        embed.setDescription(description);

        // Add address if crypto
        if (address) {
            embed.addFields({
                name: `${methodIcon} ${methodName} Address`,
                value: `\`\`\`fix\n${address}\n\`\`\``,
                inline: false,
            });
        }

        embed.setFooter({ text: "Use /payment-methods to see all payment details" });

        applyBrandThumbnail(embed);
        applyCalculatorBranding(embed);

        await interaction.editReply({
            embeds: [embed.toJSON() as any],
            components: [],
        });

        logger.info(`[CalcPaymentSelect] ${interaction.user.tag} calculated ${methodName}: $${amount} + ${upchargePercent}% = $${finalAmount.toFixed(2)}`);
    } catch (error) {
        logger.error("[CalcPaymentSelect] Error:", error);
        try {
            await interaction.editReply({
                content: "An error occurred while calculating. Please try again.",
                components: [],
            });
        } catch {}
    }
}
