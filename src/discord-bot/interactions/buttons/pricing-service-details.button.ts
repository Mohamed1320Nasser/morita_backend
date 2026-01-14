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
import { pricingMessageTracker } from "../../services/pricingMessageTracker.service";
import { splitContent, ContentItem, DISCORD_LIMITS } from "../../utils/messageSplitter";
import { handleInteractionError } from "../../utils/errorHandler";
import { toNumber } from "../../../common/utils/decimal.util";

export async function handleServiceDetails(
    interaction: ButtonInteraction
): Promise<void> {
    try {
        await interaction.deferReply({ ephemeral: true });

        const customId = interaction.customId;
        const serviceId = customId
            .replace("pricing_service_", "")
            .replace("_details", "");

        const apiService = new ApiService(discordConfig.apiBaseUrl);
        const service = await apiService.getServiceWithPricing(serviceId);

        if (!service) {
            await interaction.editReply({
                content: "Service not found or no pricing available.",
            });
            return;
        }

        const embed = buildServiceDetailsEmbed(service);

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

        const reply = await interaction.editReply({
            embeds: [embed as any],
            components: components as any,
        });

        const messageId = `${interaction.id}`; 
        pricingMessageTracker.trackMessage(messageId, async () => {
            try {
                await interaction.deleteReply();
            } catch (error) {
                logger.debug(
                    "Could not delete service details message (likely already deleted)"
                );
            }
        });

        logger.info(
            `Service details shown for ${service.name} by ${interaction.user.tag} (auto-delete in 10 minutes)`
        );
    } catch (error) {
        logger.error("Error handling service details:", error);
        await handleInteractionError(error, interaction);
    }
}

function buildServiceDetailsEmbed(service: any): EmbedBuilder {
    const categoryName = service.category?.name || "Gaming Service";
    const serviceName = service.name;
    const emoji = service.emoji || "🔹";
    const imageUrl = service.imageUrl; 

    const title = imageUrl ? serviceName : `${emoji} ${serviceName}`;
    const description = `**${categoryName}** • Professional Gaming Service\n\n${service.description || "High-quality gaming service with 24/7 support and guaranteed delivery."}`;

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(COLORS.PRIMARY); 

    if (imageUrl) {
        embed.setThumbnail(imageUrl);
    } else {
        embed.setThumbnail(
            "https://cdn.discordapp.com/avatars/1431962373719326781/542747abb0a2222bc5d5b66346d01665.webp"
        );
    }

    embed
        .setTimestamp()
        .setFooter({
            text: "Morita Gaming Services • Premium Quality",
            iconURL:
                "https://cdn.discordapp.com/avatars/1431962373719326781/542747abb0a2222bc5d5b66346d01665.webp",
        });

    if (service.pricingMethods && service.pricingMethods.length > 0) {
        const pricingLines = service.pricingMethods
            .map((method: any, index: number) => {
                const price = formatPrice(method.basePrice, method.pricingUnit);
                const tier = method.name;
                const connector =
                    index === service.pricingMethods.length - 1 ? "└─" : "├─";
                return `\`${connector}\` **${tier}** → \`${price}\``;
            });

        const fullTable = pricingLines.join("\n");
        const wrappedTable = `\`\`\`ansi\n${fullTable}\n\`\`\``;

        if (wrappedTable.length <= DISCORD_LIMITS.EMBED_FIELD_VALUE) {
            
            embed.addFields({
                name: "📊 PRICING TIERS",
                value: wrappedTable,
                inline: false,
            });
        } else {
            
            const itemsPerField = Math.ceil(pricingLines.length / Math.min(Math.ceil(pricingLines.length / 10), 3));
            let fieldNumber = 1;

            for (let i = 0; i < pricingLines.length; i += itemsPerField) {
                const chunk = pricingLines.slice(i, i + itemsPerField);
                const chunkTable = chunk.join("\n");

                embed.addFields({
                    name: `📊 PRICING TIERS ${fieldNumber > 1 ? `(Part ${fieldNumber})` : ''}`,
                    value: chunkTable,
                    inline: false,
                });
                fieldNumber++;
            }
        }
    }

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

    embed.addFields({
        name: "📋 SERVICE NOTES",
        value: `• Service completed via **PARSEC** if connection is good
• **VPN** services available for poor connections
• Ethernet cable required (upcharges may apply)
• Professional completion guaranteed`,
        inline: false,
    });

    embed.addFields({
        name: "✅ STATUS",
        value: "🟢 **Available** • Ready to order",
        inline: false,
    });

    if (imageUrl) {
        embed.setImage(imageUrl);
    }

    return embed;
}

function formatPrice(basePrice: any, pricingUnit: string): string {
    
    const price = toNumber(basePrice);

    const formattedPrice = `$${price.toFixed(2)}`;

    switch (pricingUnit) {
        case "FIXED":
            return formattedPrice;
        case "PER_LEVEL":
            return `${formattedPrice} per level`;
        case "PER_KILL":
            return `${formattedPrice} per kill`;
        case "PER_ITEM":
            return `${formattedPrice} per item`;
        case "PER_HOUR":
            return `${formattedPrice} per hour`;
        default:
            return formattedPrice;
    }
}
