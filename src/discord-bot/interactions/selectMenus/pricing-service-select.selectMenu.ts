import { StringSelectMenuInteraction } from "discord.js";
import { SelectMenuPricingBuilder } from "../../utils/selectMenuPricingBuilder";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import logger from "../../../common/loggers";

const apiService = new ApiService(discordConfig.apiBaseUrl);

export async function handlePricingServiceSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    try {
        // Immediately defer the interaction to prevent timeout
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        const categoryId = customId.replace("pricing_service_select_", "");
        const serviceId = interaction.values[0];

        // Handle "Show More" option
        if (serviceId.startsWith("show_more_")) {
            await interaction.editReply({
                content:
                    "📋 **Additional Services**\n\nThis category has more than 25 services. Please use the `/services` command to browse all available services in this category.",
            });
            return;
        }

        // Get service data with full pricing details
        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "❌ Service not found. Please try again later.",
            });
            return;
        }

        // Build professional embed with ANSI pricing table
        const embed =
            SelectMenuPricingBuilder.buildServiceDetailsEmbed(service);

        // Add action buttons
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

        // Send ephemeral reply (only user sees it)
        await interaction.editReply({
            embeds: [embed],
            components: [actionButtons],
        });

        logger.info(
            `Service details shown for ${service.name} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling pricing service select:", error);

        // Only send error message if interaction hasn't been replied to
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content:
                        "Error loading service details. Please try again later.",
                });
            } catch (followUpError) {
                logger.debug("Could not send error message:", followUpError);
            }
        } else {
            try {
                await interaction.editReply({
                    content:
                        "Error loading service details. Please try again later.",
                });
            } catch (editError) {
                logger.debug("Could not edit reply:", editError);
            }
        }
    }
}
