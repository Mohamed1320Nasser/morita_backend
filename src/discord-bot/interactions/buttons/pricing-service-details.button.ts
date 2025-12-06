import {
    ButtonInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import { ApiService } from "../../services/api.service";
import { discordConfig } from "../../config/discord.config";
import { EmbedBuilder as CustomEmbedBuilder } from "../../utils/embedBuilder";
import { COLORS } from "../../constants/colors";
import logger from "../../../common/loggers";

export async function handleServiceDetails(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        const serviceId = customId
            .replace("pricing_service_", "")
            .replace("_details", "");

        // Fetch service details with pricing
        const apiService = new ApiService(discordConfig.apiBaseUrl);
        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "Service not found or no pricing available.",
            });
            return;
        }

        // Build beautiful embed
        const embed = buildServiceDetailsEmbed(service);

        // Create professional action buttons
        const openTicketButton = new ButtonBuilder()
            .setCustomId(`open_ticket_${serviceId}_${service.category?.id || "general"}_0`)
            .setLabel("🎫 Open Ticket")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🎫");

        const calculateButton = new ButtonBuilder()
            .setCustomId(`calculate_price_${serviceId}`)
            .setLabel("💰 Calculate Price")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("🧮");

        const backButton = new ButtonBuilder()
            .setCustomId(
                `back_to_category_${service.category?.id || "unknown"}`
            )
            .setLabel("← Back to Category")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("↩️");

        const components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                openTicketButton,
                calculateButton
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(backButton),
        ];

        // Send ephemeral response
        await interaction.editReply({
            embeds: [embed as any],
            components: components as any,
        });

        // Auto-delete after 5 minutes
        setTimeout(
            async () => {
                try {
                    await interaction.deleteReply();
                } catch (error) {
                    logger.debug(
                        "Could not delete service details message (likely already deleted)"
                    );
                }
            },
            5 * 60 * 1000
        );

        logger.info(
            `Service details shown for ${service.name} by ${interaction.user.tag}`
        );
    } catch (error) {
        logger.error("Error handling service details:", error);
        await interaction.editReply({
            content: "Error loading service details. Please try again later.",
        });
    }
}

/**
 * Build beautiful embed for service details
 */
function buildServiceDetailsEmbed(service: any): EmbedBuilder {
    const categoryName = service.category?.name || "Gaming Service";
    const serviceName = service.name;
    const emoji = service.emoji || "🔹";

    // Create professional header with breadcrumb
    const title = `${emoji} ${serviceName}`;
    const description = `**${categoryName}** • Professional Gaming Service\n\n${service.description || "High-quality gaming service with 24/7 support and guaranteed delivery."}`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(COLORS.PRIMARY) // Morita bronze color
        .setThumbnail(
            "https://cdn.discordapp.com/avatars/1431962373719326781/542747abb0a2222bc5d5b66346d01665.webp"
        )
        .setTimestamp()
        .setFooter({
            text: "Morita Gaming Services • Premium Quality",
            iconURL:
                "https://cdn.discordapp.com/avatars/1431962373719326781/542747abb0a2222bc5d5b66346d01665.webp",
        });

    // Add pricing methods in a professional table format
    if (service.pricingMethods && service.pricingMethods.length > 0) {
        const pricingTable = service.pricingMethods
            .map((method: any, index: number) => {
                const price = formatPrice(method.basePrice, method.pricingUnit);
                const tier = method.name;
                const connector =
                    index === service.pricingMethods.length - 1 ? "└─" : "├─";
                return `\`${connector}\` **${tier}** → \`${price}\``;
            })
            .join("\n");

        embed.addFields({
            name: "📊 PRICING TIERS",
            value: `\`\`\`ansi\n${pricingTable}\n\`\`\``,
            inline: false,
        });
    }

    // Add service information
    const serviceInfo = [
        "⏱️ **Estimated Time:** 3-7 days",
        "🛡️ **Guarantee:** 100% completion",
        "🔄 **Refund:** 30-day money back",
        "📞 **Support:** 24/7 available",
    ].join("\n");

    embed.addFields({
        name: "ℹ️ SERVICE INFO",
        value: serviceInfo,
        inline: true,
    });

    // Add payment methods
    if (service.paymentMethods && service.paymentMethods.length > 0) {
        const paymentMethods = service.paymentMethods
            .map((method: any) => `• ${method.name}`)
            .join("\n");

        embed.addFields({
            name: "💳 PAYMENT METHODS",
            value: paymentMethods,
            inline: true,
        });
    }

    // Add service notes
    embed.addFields({
        name: "📋 SERVICE NOTES",
        value: `• Service completed via **PARSEC** if connection is good
• **VPN** services available for poor connections
• Ethernet cable required (upcharges may apply)
• Professional completion guaranteed`,
        inline: false,
    });

    // Add status indicator
    embed.addFields({
        name: "✅ STATUS",
        value: "🟢 **Available** • Ready to order",
        inline: false,
    });

    return embed;
}

/**
 * Format price based on pricing unit
 */
function formatPrice(basePrice: number | string, pricingUnit: string): string {
    // Convert to number if it's a string (from database Decimal type)
    const price =
        typeof basePrice === "string" ? parseFloat(basePrice) : basePrice;

    // Handle NaN or invalid numbers
    if (isNaN(price)) {
        return "$0.00";
    }

    switch (pricingUnit) {
        case "FIXED":
            return `$${price.toFixed(2)}`;
        case "PER_LEVEL":
            return `$${price.toFixed(2)} per level`;
        case "PER_KILL":
            return `$${price.toFixed(2)} per kill`;
        case "PER_ITEM":
            return `$${price.toFixed(2)} per item`;
        case "PER_HOUR":
            return `$${price.toFixed(2)} per hour`;
        default:
            return `$${price.toFixed(2)}`;
    }
}
