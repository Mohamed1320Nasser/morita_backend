import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleHelpPricing(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const embed = EmbedBuilder.createHelpEmbed();
        embed.setDescription("**💰 Pricing Help**\n\nHow to calculate prices and understand our pricing system");
        embed.addFields(
            {
                name: "🧮 Price Calculator",
                value: 'Use `/pricing` or click "Calculate Price" to open the pricing calculator.',
                inline: false,
            },
            {
                name: "📊 Pricing Methods",
                value: "Each service has different pricing methods (Fixed, Per Level, Per Kill, etc.). Select the one that fits your needs.",
                inline: false,
            },
            {
                name: "💳 Payment Methods",
                value: "Choose between Crypto and Non-Crypto payment options. Crypto payments often have discounts.",
                inline: false,
            },
            {
                name: "🔧 Modifiers",
                value: "Additional options may affect the final price. Check all applicable modifiers for accurate pricing.",
                inline: false,
            },
            {
                name: "📈 Price Breakdown",
                value: "The calculator shows a detailed breakdown of base price, modifiers, and final total.",
                inline: false,
            }
        );

        await interaction.reply({
            embeds: [embed as any],
            ephemeral: true,
        });

        logger.info(`Pricing help requested by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling help pricing button:", error);
        await interaction.reply({
            content: "Failed to load help information. Please try again.",
            ephemeral: true,
        });
    }
}
