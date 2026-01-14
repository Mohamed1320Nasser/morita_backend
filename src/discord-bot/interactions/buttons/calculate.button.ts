import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleCalculate(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createErrorEmbed(
            "Please select a pricing method and payment method first.",
            "Selection Required"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Calculate button pressed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling calculate button:", error);
        await interaction.editReply({
            content: "Failed to calculate price. Please try again.",
        });
    }
}
