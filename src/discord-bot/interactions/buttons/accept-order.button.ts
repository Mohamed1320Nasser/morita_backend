import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleAcceptOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createSuccessEmbed(
            "Order accepted! You can now start working on this order.",
            "Order Accepted"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Order accepted by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling accept order button:", error);
        await interaction.editReply({
            content: "Failed to accept order. Please try again.",
        });
    }
}
