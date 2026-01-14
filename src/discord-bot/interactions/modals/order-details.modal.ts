import { ModalSubmitInteraction } from "discord.js";
import { EmbedBuilder } from "../../utils/embedBuilder";
import { ComponentBuilder } from "../../utils/componentBuilder";
import logger from "../../../common/loggers";

export async function handleOrderDetailsModal(
    interaction: ModalSubmitInteraction
): Promise<void> {
    try {
        await interaction.deferReply();

        const osrsUsername =
            interaction.fields.getTextInputValue("osrs_username");
        const discordTag = interaction.fields.getTextInputValue("discord_tag");
        const specialNotes =
            interaction.fields.getTextInputValue("special_notes");

        const isTicket = interaction.customId === "order_details_modal_ticket";

        if (isTicket) {
            
            const embed = EmbedBuilder.createSuccessEmbed(
                "Support ticket created successfully! A staff member will contact you soon.",
                "Ticket Created"
            );

            await interaction.editReply({
                embeds: [embed as any],
            });

            logger.info(
                `Support ticket created by ${interaction.user.tag}: ${specialNotes}`
            );
            return;
        }

        const serviceId = interaction.customId.replace(
            "order_details_modal_",
            ""
        );

        if (!serviceId) {
            await interaction.editReply({
                content: "Invalid order request. Please try again.",
            });
            return;
        }

        const service =
            await interaction.client.apiService.getServiceById(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "Service not found. Please try again.",
            });
            return;
        }

        const orderData = {
            osrsUsername,
            discordTag,
            specialNotes,
            serviceName: service.name,
            methodName: "Default Method", 
            paymentMethod: "Crypto", 
            totalPrice: 0, 
        };

        const embed = EmbedBuilder.createOrderConfirmationEmbed(orderData);
        const confirmationButtons =
            ComponentBuilder.createOrderConfirmationButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [confirmationButtons as any],
        });

        logger.info(
            `Order details submitted by ${interaction.user.tag} for service: ${service.name}`
        );
    } catch (error) {
        logger.error("Error handling order details modal:", error);
        await interaction.editReply({
            content: "Failed to process order details. Please try again.",
        });
    }
}
