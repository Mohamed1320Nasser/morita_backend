import { SelectMenuInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleCategorySelect(
    interaction: SelectMenuInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const categoryId = interaction.values[0];

        if (!categoryId) {
            await interaction.editReply({
                content: "Invalid category selection. Please try again.",
            });
            return;
        }

        const services =
            await interaction.client.apiService.getServices(categoryId);

        if (!services || services.length === 0) {
            const embed = EmbedBuilder.createErrorEmbed(
                "No services available in this category.",
                "No Services Found"
            );
            await interaction.editReply({ embeds: [embed.toJSON() as any] });
            return;
        }

        const embed = EmbedBuilder.createServicesEmbed([]);
        embed.setTitle("🎮 Available Services");
        embed.setDescription("Select a service to view details:");

        const serviceSelectMenu =
            ComponentBuilder.createServiceSelectMenu(services);
        const navigationButtons = ComponentBuilder.createNavigationButtons();

        await interaction.editReply({
            embeds: [embed.toJSON() as any],
            components: [
                serviceSelectMenu.toJSON(),
                navigationButtons.toJSON(),
            ] as any,
        });

        logger.info(
            `Category selected: ${categoryId} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling category select menu:", error);
        await interaction.editReply({
            content: "Failed to load services. Please try again.",
        });
    }
}
