import {
    ButtonInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import logger from "../../../common/loggers";

export async function handleRecalculate(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Get service ID from button custom ID
        // Format: 'recalculate_<serviceId>' or 'recalculate_inticket_<serviceId>'
        let customIdPart = interaction.customId.replace("recalculate_", "");
        const isFromTicket = customIdPart.startsWith("inticket_");

        if (isFromTicket) {
            customIdPart = customIdPart.replace("inticket_", "");
        }

        const serviceId = customIdPart;

        if (!serviceId) {
            await interaction.reply({
                content: "Invalid service selection. Please try again.",
                ephemeral: true,
            });
            return;
        }

        // Fetch service to get the name
        const service =
            await interaction.client.apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.reply({
                content: "Service not found. Please try again.",
                ephemeral: true,
            });
            return;
        }

        // Create modal for level input - preserve the inticket context
        const modalCustomId = isFromTicket
            ? `calculator_modal_inticket_${serviceId}`
            : `calculator_modal_${serviceId}`;

        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
            .setTitle(`${service.emoji || "⭐"} ${service.name} Calculator`);

        // Start level input
        const startLevelInput = new TextInputBuilder()
            .setCustomId("start_level")
            .setLabel("Start Level (1-99)")
            .setPlaceholder("e.g., 70")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true);

        // End level input
        const endLevelInput = new TextInputBuilder()
            .setCustomId("end_level")
            .setLabel("End Level (1-99)")
            .setPlaceholder("e.g., 99")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true);

        // Add inputs to action rows
        const startLevelRow =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                startLevelInput
            );
        const endLevelRow =
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                endLevelInput
            );

        modal.addComponents(startLevelRow, endLevelRow);

        // Show the modal
        await interaction.showModal(modal as any);

        logger.info(
            `Recalculate modal shown for service: ${service.name} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling recalculate button:", error);

        // If interaction not replied yet, reply with error
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "Failed to open calculator. Please try again.",
                ephemeral: true,
            });
        }
    }
}
