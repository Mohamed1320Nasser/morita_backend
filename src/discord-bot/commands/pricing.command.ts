import { SlashCommandBuilder, CommandInteraction } from "discord.js";
import { Command } from "../types/discord.types";
import { EmbedBuilder } from "../utils/embedBuilder";
import { ComponentBuilder } from "../utils/componentBuilder";
import logger from "../../common/loggers";

export default {
    data: new SlashCommandBuilder()
        .setName("pricing")
        .setDescription("Calculate service pricing")
        .addStringOption(option =>
            option
                .setName("service")
                .setDescription("The service to calculate pricing for")
                .setRequired(false)
        ),

    async execute(interaction: CommandInteraction) {
        try {
            await interaction.deferReply();

            const serviceName = interaction.options.get("service")
                ?.value as string;

            if (serviceName) {
                
                await handleDirectPricing(interaction, serviceName);
            } else {
                
                await handleServiceSelection(interaction);
            }

            logger.info(`Pricing command executed by ${interaction.user.tag}`);
        } catch (error) {
            logger.error("Error executing pricing command:", error);

            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "Failed to load pricing information. Please try again later.",
                "Pricing Error"
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

async function handleDirectPricing(
    interaction: CommandInteraction,
    serviceName: string
) {
    try {
        
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

        const embed =
            EmbedBuilder.createPricingCalculatorEmbed(serviceWithPricing);
        const methodSelectMenu = ComponentBuilder.createMethodSelectMenu(
            serviceWithPricing.pricingMethods
        );
        const pricingButtons = ComponentBuilder.createPricingButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [methodSelectMenu as any, pricingButtons as any],
        });
    } catch (error) {
        logger.error("Error handling direct pricing:", error);
        throw error;
    }
}

async function handleServiceSelection(interaction: CommandInteraction) {
    try {
        
        const services = await interaction.client.apiService.getServices();

        if (!services || services.length === 0) {
            const errorEmbed = EmbedBuilder.createErrorEmbed(
                "No services are currently available.",
                "No Services Available"
            );
            await interaction.editReply({ embeds: [errorEmbed as any] });
            return;
        }

        const embed = EmbedBuilder.createServicesEmbed([]);
        embed.setTitle("💰 Price Calculator");
        embed.setDescription("Select a service to calculate pricing:");

        const serviceSelectMenu =
            ComponentBuilder.createServiceSelectMenu(services);
        const navigationButtons = ComponentBuilder.createNavigationButtons();

        await interaction.editReply({
            embeds: [embed as any],
            components: [serviceSelectMenu as any, navigationButtons as any],
        });
    } catch (error) {
        logger.error("Error handling service selection:", error);
        throw error;
    }
}
