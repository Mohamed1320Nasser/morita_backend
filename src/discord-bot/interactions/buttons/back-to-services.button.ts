import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";

export async function handleBackToServices(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Clear auto-delete timeout (user navigated away)
        const messageId = `${interaction.id}`;
        pricingMessageTracker.clearTimeout(messageId);

        await interaction.deferReply();

        // Fetch categories from API
        const categories = await interaction.client.apiService.getCategories();

        if (!categories || categories.length === 0) {
            await interaction.editReply({
                content:
                    "No services are currently available. Please try again later.",
            });
            return;
        }

        // Create services embed and components
        const embed = EmbedBuilder.createServicesEmbed(categories);
        const categorySelectMenu =
            ComponentBuilder.createCategorySelectMenu(categories);
        const navigationButtons = ComponentBuilder.createNavigationButtons();

        await interaction.editReply({
            embeds: [embed.toJSON() as any],
            components: [
                categorySelectMenu.toJSON(),
                navigationButtons.toJSON(),
            ] as any,
        });

        logger.info(`Back to services by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling back to services button:", error);
        await interaction.editReply({
            content: "Failed to load services. Please try again.",
        });
    }
}
