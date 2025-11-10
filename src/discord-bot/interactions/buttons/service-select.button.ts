import { ButtonInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleServiceSelect(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        // Get service ID from button custom ID (assuming it's in the format 'service_select_<id>')
        const serviceId = interaction.customId.replace("service_select_", "");

        if (!serviceId) {
            await interaction.editReply({
                content: "Invalid service selection. Please try again.",
            });
            return;
        }

        // Fetch service details
        const service =
            await interaction.client.apiService.getServiceById(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "Service not found. Please try again.",
            });
            return;
        }

        // Create service details embed
        const embed = EmbedBuilder.createServiceDetailsEmbed(service);
        const actionButtons = ComponentBuilder.createServiceActionButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [actionButtons as any],
        });

        logger.info(
            `Service selected: ${service.name} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling service select button:", error);
        await interaction.editReply({
            content: "Failed to load service details. Please try again.",
        });
    }
}
