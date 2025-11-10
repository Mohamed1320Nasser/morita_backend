import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleHelpServices(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        const embed = EmbedBuilder.createHelpEmbed();
        embed.setDescription(
            "**🎮 Services Help**\n\nHow to browse and select our gaming services"
        );
        embed.addFields(
            {
                name: "📋 Browsing Services",
                value: "Use `/services` to see all available service categories. Click on a category to view specific services.",
                inline: false,
            },
            {
                name: "🔍 Finding Services",
                value: 'Each service shows pricing methods, descriptions, and requirements. Click "View Details" for more information.',
                inline: false,
            },
            {
                name: "💰 Pricing",
                value: 'Click "Calculate Price" to see detailed pricing with modifiers and payment options.',
                inline: false,
            },
            {
                name: "📦 Ordering",
                value: 'Click "Order Now" to create an order. Fill out the form with your details.',
                inline: false,
            }
        );

        await interaction.reply({
            embeds: [embed as any],
            ephemeral: true,
        });

        logger.info(`Services help requested by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling help services button:", error);
        await interaction.reply({
            content: "Failed to load help information. Please try again.",
            ephemeral: true,
        });
    }
}
