import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import logger from "../../../common/loggers";

export async function handleCancelTicketOrder(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const embed = EmbedBuilder.createErrorEmbed(
            "Order cancelled. The customer has been notified.",
            "Order Cancelled"
        );

        await interaction.editReply({
            embeds: [embed as any],
        });

        logger.info(`Ticket order cancelled by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling cancel ticket order button:", error);
        await interaction.editReply({
            content: "Failed to cancel order. Please try again.",
        });
    }
}
