import { ButtonInteraction } from "discord.js";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleOpenTicket(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        // Create ticket modal
        const modal = ComponentBuilder.createOrderDetailsModal();
        modal.setTitle("🎫 Open Support Ticket");

        // Modify the modal for ticket creation
        const osrsUsernameInput = (modal.components[0] as any)
            .components[0] as any;
        osrsUsernameInput.setLabel("Your OSRS Username (Optional)");
        osrsUsernameInput.setRequired(false);

        const discordTagInput = (modal.components[1] as any)
            .components[0] as any;
        discordTagInput.setLabel("Your Discord Tag");
        discordTagInput.setValue(interaction.user.tag);

        const specialNotesInput = (modal.components[2] as any)
            .components[0] as any;
        specialNotesInput.setLabel("Describe your request or issue");
        specialNotesInput.setPlaceholder(
            "Please describe what you need help with or what custom service you require..."
        );

        await interaction.showModal(modal as any);

        logger.info(`Ticket modal opened by ${interaction.user.tag}`);
    } catch (error) {
        logger.error("Error handling open ticket button:", error);
        await interaction.reply({
            content: "Failed to open ticket form. Please try again.",
            ephemeral: true,
        });
    }
}
