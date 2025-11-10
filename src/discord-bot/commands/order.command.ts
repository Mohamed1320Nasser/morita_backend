import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { ComponentBuilder } from "../utils/componentBuilder";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("order")
        .setDescription("Create a new order")
        .addStringOption(option =>
            option
                .setName("service")
                .setDescription("The service to order")
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply();

            const serviceName = interaction.options.get("service")
                ?.value as string;

            if (serviceName) {
                // Direct order creation
                await handleDirectOrder(interaction, serviceName);
            } else {
                // Show service selection for order
                await handleOrderServiceSelection(interaction);
            }

            logger.info(`Order command executed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("Error executing order command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to process order request. Please try again later.",
                "Order Error"
            );

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed as any] });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed as any],
                    ephemeral: true,
                });
            }
        }
    },
} as Command;

async function handleDirectOrder(
    interaction: CommandInteraction,
    serviceName: string
) {
    try {
        // Search for service by name
        const services = await interaction.client.apiService.getServices();
        const service = services.find(
            s =>
                s.name.toLowerCase().includes(serviceName.toLowerCase()) ||
                s.slug.toLowerCase().includes(serviceName.toLowerCase())
        );

        if (!service) {
            const errorEmbed = EmbedBuilder.createErrorEmbed(
                `Service "${serviceName}" not found. Please check the name and try again.`,
                "Service Not Found"
            );
            await interaction.editReply({ embeds: [errorEmbed as any] });
            return;
        }

        // Get service with pricing details
        const serviceWithPricing =
            await interaction.client.apiService.getServiceById(service.id);

        if (
            !serviceWithPricing.pricingMethods ||
            serviceWithPricing.pricingMethods.length === 0
        ) {
            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "No pricing methods available for this service.",
                "No Pricing Available"
            );
            await interaction.editReply({ embeds: [errorEmbed as any] });
            return;
        }

        // Create order flow - show service details and pricing methods
        const embed =
            EmbedBuilder.createServiceDetailsEmbed(serviceWithPricing);
        const methodSelectMenu = ComponentBuilder.createMethodSelectMenu(
            serviceWithPricing.pricingMethods
        );
        const actionButtons = ComponentBuilder.createServiceActionButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [methodSelectMenu as any, actionButtons as any],
        });
    } catch (error) {
        logger.error("Error handling direct order:", error);
        throw error;
    }
}

async function handleOrderServiceSelection(interaction: CommandInteraction) {
    try {
        // Get all services
        const services = await interaction.client.apiService.getServices();

        if (!services || services.length === 0) {
            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "No services are currently available.",
                "No Services Available"
            );
            await interaction.editReply({ embeds: [errorEmbed as any] });
            return;
        }

        // Create service selection embed for orders
        const embed = EmbedBuilder.createServicesEmbed([]);
        embed.setTitle("📦 Create Order");
        embed.setDescription("Select a service to create an order:");

        const serviceSelectMenu =
            ComponentBuilder.createServiceSelectMenu(services);
        const navigationButtons = ComponentBuilder.createNavigationButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [serviceSelectMenu as any, navigationButtons as any],
        });
    } catch (error) {
        logger.error("Error handling order service selection:", error);
        throw error;
    }
}
