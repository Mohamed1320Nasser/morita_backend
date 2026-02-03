import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} from "discord.js";
import prisma from "../../common/prisma/client";
import logger from "../../common/loggers";

// Valid Discord emojis for select menu options
const CURRENCY_EMOJIS: Record<string, string> = {
    BTC: "🟠",
    LTC: "⚪",
    ETH: "🔷",
    USDT: "💵",
    USDC: "🔵",
    SOL: "🟣",
    XRP: "⚫",
};

const PAYMENT_EMOJIS: Record<string, string> = {
    PAYPAL: "💳",
    ZELLE: "🏦",
    WISE: "💸",
    REVOLUT: "🔄",
    E_TRANSFER: "📧",
    CASHAPP: "💵",
    VENMO: "📱",
    OTHER: "💰",
};

export const data = new SlashCommandBuilder()
    .setName("calculate-payment")
    .setDescription("Calculate final amount with payment method fees")
    .addNumberOption((option) =>
        option
            .setName("amount")
            .setDescription("The amount you want to pay (e.g., 100)")
            .setRequired(true)
            .setMinValue(0.01)
    );

export default { data, execute };

async function execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const amount = interaction.options.getNumber("amount", true);

        // Fetch all active payment methods
        const cryptoWallets = await prisma.cryptoWallet.findMany({
            where: { isActive: true },
            orderBy: { currency: "asc" },
        });

        const manualPayments = await prisma.manualPaymentOption.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: "asc" },
        });

        if (cryptoWallets.length === 0 && manualPayments.length === 0) {
            await interaction.editReply({
                content: "No payment methods are currently available.",
            });
            return;
        }

        // Build select menu options
        const options: { label: string; value: string; description: string; emoji?: string }[] = [];

        // Add crypto options (group by currency to avoid duplicates)
        const cryptoByCurrency: Record<string, typeof cryptoWallets[0]> = {};
        for (const wallet of cryptoWallets) {
            if (!cryptoByCurrency[wallet.currency]) {
                cryptoByCurrency[wallet.currency] = wallet;
            }
        }

        for (const [currency, wallet] of Object.entries(cryptoByCurrency)) {
            const emoji = CURRENCY_EMOJIS[currency] || "💰";
            const upchargeText = wallet.upchargePercent > 0
                ? `+${wallet.upchargePercent}% fee`
                : "No fee";

            options.push({
                label: currency,
                value: `crypto_${wallet.id}`,
                description: upchargeText,
                emoji: emoji,
            });
        }

        // Add manual payment options
        for (const payment of manualPayments) {
            const emoji = PAYMENT_EMOJIS[payment.type] || "💳";
            const upchargeText = payment.upchargePercent > 0
                ? `+${payment.upchargePercent}% fee`
                : "No fee";

            options.push({
                label: payment.name,
                value: `manual_${payment.id}`,
                description: upchargeText,
                emoji: emoji,
            });
        }

        // Limit to 25 options (Discord limit)
        const limitedOptions = options.slice(0, 25);

        const embed = new EmbedBuilder()
            .setTitle("💰 Calculate Payment")
            .setDescription(
                `**Original Amount:** $${amount.toFixed(2)}\n\n` +
                `Select a payment method below to see the final amount with any applicable fees.`
            )
            .setColor(0x5865F2)
            .setTimestamp();

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`calc_payment_select_${amount}`)
            .setPlaceholder("Select payment method...")
            .addOptions(limitedOptions);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        await interaction.editReply({
            embeds: [embed.toJSON() as any],
            components: [row.toJSON() as any],
        });

        logger.info(`[CalculatePayment] Command executed by ${interaction.user.tag} for amount $${amount}`);
    } catch (error) {
        logger.error("[CalculatePayment] Error:", error);
        await interaction.editReply({
            content: "Failed to load payment methods. Please try again.",
        });
    }
}
