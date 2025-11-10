import { SelectMenuInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handlePaymentSelect(
    interaction: SelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const paymentMethodId = interaction.values[0];

        if (!paymentMethodId) {
            await interaction.editReply({
                content: "Invalid payment method selection. Please try again.",
            });
            return;
        }

        // For now, show a placeholder message
        // In a real implementation, this would calculate the price and show the breakdown
        const embed = EmbedBuilder.createSuccessEmbed(
            "Payment method selected! Click Calculate to see the price breakdown.",
            "Payment Method Selected"
        );

        const pricingButtons = ComponentBuilder.createPricingButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [pricingButtons as any],
        });

        logger.info(
            `Payment method selected: ${paymentMethodId} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling payment select menu:", error);
        await interaction.editReply({
            content:
                "Failed to process payment method selection. Please try again.",
        });
    }
}
