import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleOrderConfirm(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createSuccessEmbed(
            "Order confirmed! A support ticket has been created for you.",
            "Order Confirmed"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Order confirmed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling order confirm button:", error);
        await interaction.editReply({
            content: "Failed to confirm order. Please try again.",
        });
    }
}
