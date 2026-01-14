import { StringSelectMenuInteraction } from "discord.js";
import { SelectMenuPricingBuilder } from "../../utils/selectMenuPricingBuilder";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import logger from "../../../common/loggers";
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";

const apiService = new ApiService(discordConfig.apiBaseUrl);

export async function handlePricingServiceSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    try {
        
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        const categoryId = customId.replace("pricing_service_select_", "");
        const serviceId = interaction.values[0];

        if (serviceId.startsWith("show_more_")) {
            await interaction.editReply({
                content:
                    "📋 **Additional Services**\n\nThis category has more than 25 services. Please use the `/services` command to browse all available services in this category.",
            });
            return;
        }

        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "❌ Service not found. Please try again later.",
            });
            return;
        }

        const embed =
            SelectMenuPricingBuilder.buildServiceDetailsEmbed(service);

        const {
            ActionRowBuilder,
            ButtonBuilder,
            ButtonStyle,
        } = require("discord.js");
        const actionButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`open_ticket_${serviceId}_${categoryId}_0`)
                .setLabel("🎫 Open Ticket")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`calculate_price_${serviceId}`)
                .setLabel("💰 Calculate Price")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`back_to_category_${categoryId}`)
                .setLabel("⬅️ Back")
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
            embeds: [embed],
            components: [actionButtons],
        });

        const messageId = `${interaction.id}`; 
        pricingMessageTracker.trackMessage(messageId, async () => {
            try {
                await interaction.deleteReply();
            } catch (error) {
                logger.debug(
                    "Could not delete pricing message (likely already deleted)"
                );
            }
        });

        logger.info(
            `Service details shown for ${service.name} by ${interaction.user.tag} (auto-delete in 10 minutes)`
        );
    } catch (error) {
        logger.error("Error handling pricing service select:", error);

        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content:
                        "❌ Error loading service details. Please try again later.",
                });
            } else {
                await interaction.reply({
                    content:
                        "❌ Error loading service details. Please try again later.",
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.debug("Could not send error message:", replyError);
        }
    }
}
