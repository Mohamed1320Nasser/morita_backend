import { SelectMenuInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleMethodSelect(
    interaction: SelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const methodId = interaction.values[0];

        if (!methodId) {
            await interaction.editReply({
                content: "Invalid method selection. Please try again.",
            });
            return;
        }

        // Fetch payment methods
        const paymentMethods =
            await interaction.client.apiService.getPaymentMethods();

        if (!paymentMethods || paymentMethods.length === 0) {
            await interaction.editReply({
                content: "No payment methods available.",
            });
            return;
        }

        // Create payment selection embed
        const embed = EmbedBuilder.createPricingCalculatorEmbed({} as any);
        embed.setDescription("Select a payment method to continue:");

        const paymentSelectMenu =
            ComponentBuilder.createPaymentSelectMenu(paymentMethods);
        const pricingButtons = ComponentBuilder.createPricingButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [paymentSelectMenu, pricingButtons as any],
        });

        logger.info(`Method selected: ${methodId} by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling method select menu:", error);
        await interaction.editReply({
            content: "Failed to load payment methods. Please try again.",
        });
    }
}
