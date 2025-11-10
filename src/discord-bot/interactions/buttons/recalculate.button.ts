import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleRecalculate(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        // Reset the pricing calculator to initial state
        const embed = EmbedBuilder.createPricingCalculatorEmbed({} as any);
        embed.setDescription(
            "Select your options to calculate the final price"
        );

        await interaction.editReply({
            embeds: [embed as any],
            components: [] as any,
        });

        logger.info(`Recalculate pressed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling recalculate button:", error);
        await interaction.editReply({
            content: "Failed to reset calculator. Please try again.",
        });
    }
}
