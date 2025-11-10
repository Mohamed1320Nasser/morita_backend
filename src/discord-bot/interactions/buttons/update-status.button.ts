import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleUpdateStatus(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createSuccessEmbed(
            "Status update feature coming soon! For now, you can manually update the order status.",
            "Status Update"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Update status pressed by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling update status button:", error);
        await interaction.editReply({
            content: "Failed to update status. Please try again.",
        });
    }
}
