import {
    EmbedBuilder as DiscordEmbedBuilder,
    ColorResolvable,
} from "discord.js";
import { COLORS, COLOR_MAPPING } from "../constants/colors";
import { MESSAGES } from "../constants/messages";
import { EMOJIS } from "../constants/emojis";
import {
    ServiceCategory,
    Service,
    PricingMethod,
    PriceCalculationResult,
} from "../types/discord.types";

export class EmbedBuilder {
    private embed: DiscordEmbedBuilder;

    constructor() {
        this.embed = new DiscordEmbedBuilder();
    }

    static createServicesEmbed(
        categories: ServiceCategory[]
    ): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.BRAND} MORITA Gaming Services`)
            .setDescription(
                "**Professional OSRS Services & Premium Gaming Solutions**\n\nSelect a category below to browse our services:"
            )
            .setColor(COLORS.PRIMARY as ColorResolvable)
            .setThumbnail(
                process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮"
            )
            .setAuthor({
                name: "MORITA Gaming",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/32x32/c9a961/1a2744?text=🎮",
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming Services • Professional & Reliable",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        const categoryFields = categories.map(category => ({
            name: `${category.emoji || EMOJIS.SERVICE} ${category.name}`,
            value: `\`\`\`${category.description || "Click to view services"}\`\`\``,
            inline: true,
        }));

        embed.addFields(categoryFields);

        embed.addFields({
            name: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            value: "**Choose a category to get started**",
            inline: false,
        });

        return embed;
    }

    static createServiceDetailsEmbed(service: Service): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(`${service.emoji || EMOJIS.SERVICE} ${service.name}`)
            .setDescription(
                `\`\`\`${service.description || "Professional gaming service"}\`\`\``
            )
            .setColor(
                COLOR_MAPPING[
                    service.category?.slug as keyof typeof COLOR_MAPPING
                ] || (COLORS.PRIMARY as ColorResolvable)
            )
            .setThumbnail(
                process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮"
            )
            .setAuthor({
                name: "MORITA Gaming",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/32x32/c9a961/1a2744?text=🎮",
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming Services • Professional & Reliable",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        if (service.pricingMethods && service.pricingMethods.length > 0) {
            const pricingText = service.pricingMethods
                .map(method => {
                    const basePrice = `**$${method.basePrice}**`;
                    const unit =
                        method.pricingUnit === "FIXED"
                            ? ""
                            : ` \`${method.pricingUnit}\``;
                    return `🔸 ${method.name}: ${basePrice}${unit}`;
                })
                .join("\n");

            embed.addFields({
                name: `${EMOJIS.PRICE} **Pricing Options**`,
                value: pricingText || "No pricing methods available",
                inline: false,
            });
        }

        if (service.serviceModifiers && service.serviceModifiers.length > 0) {
            const modifiersText = service.serviceModifiers
                .map(modifier => {
                    const icon = modifier.displayType === 'UPCHARGE' ? '🔺' :
                                 modifier.displayType === 'NOTE' ? '📝' :
                                 modifier.displayType === 'WARNING' ? '⚠️' : '⚙️';
                    const sign = Number(modifier.value) >= 0 ? '+' : '';
                    const unit = modifier.modifierType === 'PERCENTAGE' ? '%' : 'M';
                    return `${icon} ${sign}${modifier.value}${unit} ${modifier.name}`;
                })
                .join("\n");

            embed.addFields({
                name: "⚙️ **Available Modifiers** (All Methods)",
                value: modifiersText,
                inline: false,
            });
        }

        embed.addFields({
            name: "📊 **Service Status**",
            value: service.active
                ? "✅ **Active** - Available for orders"
                : "❌ **Inactive** - Temporarily unavailable",
            inline: true,
        });

        return embed;
    }

    static createPricingCalculatorEmbed(service: Service): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(
                `${EMOJIS.CALCULATE} ${MESSAGES.PRICING_TITLE} - ${service.name}`
            )
            .setDescription("Select your options to calculate the final price")
            .setColor(COLORS.INFO as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        return embed;
    }

    static createPriceBreakdownEmbed(
        result: PriceCalculationResult,
        serviceName: string
    ): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.PRICE} Price Breakdown`)
            .setDescription(`\`\`\`Service: ${serviceName}\`\`\``)
            .setColor(COLORS.SUCCESS as ColorResolvable)
            .setThumbnail(
                process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮"
            )
            .setAuthor({
                name: "MORITA Gaming",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/32x32/c9a961/1a2744?text=🎮",
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming Services • Professional & Reliable",
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        embed.addFields(
            {
                name: `${EMOJIS.PRICE} **Base Price**`,
                value: `\`\`\`$${result.basePrice}\`\`\``,
                inline: true,
            },
            {
                name: `${EMOJIS.CREDIT_CARD} **Payment Method**`,
                value: `\`\`\`${result.paymentMethod.name}\n(${result.paymentMethod.type})\`\`\``,
                inline: true,
            }
        );

        if (result.serviceModifiers && result.serviceModifiers.length > 0) {
            const appliedServiceMods = result.serviceModifiers.filter(m => m.applied);

            if (appliedServiceMods.length > 0) {
                const serviceModsText = appliedServiceMods
                    .map(modifier => {
                        const value = modifier.appliedAmount
                            ? `$${modifier.appliedAmount.toFixed(2)}`
                            : (modifier.type === "PERCENTAGE" ? `${modifier.value}%` : `$${modifier.value}`);
                        return `• ${modifier.name}: ${value}`;
                    })
                    .join("\n");

                embed.addFields({
                    name: "⚙️ **Service Modifiers**",
                    value: serviceModsText,
                    inline: false,
                });
            }
        }

        if (result.methodModifiers && result.methodModifiers.length > 0) {
            const appliedMethodMods = result.methodModifiers.filter(m => m.applied);

            if (appliedMethodMods.length > 0) {
                const methodModsText = appliedMethodMods
                    .map(modifier => {
                        const value = modifier.appliedAmount
                            ? `$${modifier.appliedAmount.toFixed(2)}`
                            : (modifier.type === "PERCENTAGE" ? `${modifier.value}%` : `$${modifier.value}`);
                        return `• ${modifier.name}: ${value}`;
                    })
                    .join("\n");

                embed.addFields({
                    name: "🔧 **Method Modifiers**",
                    value: methodModsText,
                    inline: false,
                });
            }
        }

        if ((!result.serviceModifiers || result.serviceModifiers.length === 0) &&
            (!result.methodModifiers || result.methodModifiers.length === 0) &&
            result.modifiers && result.modifiers.length > 0) {
            const appliedModifiers = result.modifiers.filter(m => m.applied);

            if (appliedModifiers.length > 0) {
                const modifiersText = appliedModifiers
                    .map(modifier => {
                        const value =
                            modifier.type === "PERCENTAGE"
                                ? `${modifier.value}%`
                                : `$${modifier.value}`;
                        return `• ${modifier.name}: +${value}`;
                    })
                    .join("\n");

                embed.addFields({
                    name: `${EMOJIS.DISCOUNT} Applied Modifiers:`,
                    value: modifiersText,
                    inline: false,
                });
            }
        }

        embed.addFields({
            name: `${EMOJIS.TROPHY} ${MESSAGES.TOTAL_PRICE}`,
            value: `**$${result.finalPrice}**`,
            inline: false,
        });

        return embed;
    }

    static createOrderConfirmationEmbed(orderData: any): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.ORDER} ${MESSAGES.ORDER_CONFIRMATION}`)
            .setDescription(
                "Please review your order details before confirming"
            )
            .setColor(COLORS.WARNING as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        embed.addFields(
            {
                name: `${EMOJIS.USER} Customer Information`,
                value: `**OSRS Username:** ${orderData.osrsUsername}\n**Discord:** ${orderData.discordTag}`,
                inline: false,
            },
            {
                name: `${EMOJIS.SERVICE} Service Details`,
                value: `**Service:** ${orderData.serviceName}\n**Method:** ${orderData.methodName}\n**Payment:** ${orderData.paymentMethod}`,
                inline: false,
            },
            {
                name: `${EMOJIS.PRICE} Pricing`,
                value: `**Total Price:** $${orderData.totalPrice}`,
                inline: false,
            }
        );

        if (orderData.specialNotes) {
            embed.addFields({
                name: `${EMOJIS.MEMO} Special Notes`,
                value: orderData.specialNotes,
                inline: false,
            });
        }

        return embed;
    }

    static createTicketEmbed(ticketData: any): DiscordEmbedBuilder {
        const statusColor =
            COLOR_MAPPING[ticketData.status as keyof typeof COLOR_MAPPING] ||
            COLORS.WARNING;

        const embed = new DiscordEmbedBuilder()
            .setTitle(
                `${EMOJIS.TICKET} ${MESSAGES.TICKET_TITLE} #${ticketData.orderId}`
            )
            .setDescription(`**Service:** ${ticketData.serviceName}`)
            .setColor(statusColor as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        embed.addFields(
            {
                name: `${EMOJIS.USER} ${MESSAGES.CUSTOMER_INFO}`,
                value: `**Customer:** <@${ticketData.customerId}>\n**OSRS Username:** ${ticketData.osrsUsername}`,
                inline: false,
            },
            {
                name: `${EMOJIS.SERVICE} ${MESSAGES.SERVICE_INFO}`,
                value: `**Service:** ${ticketData.serviceName}\n**Method:** ${ticketData.methodName}`,
                inline: false,
            },
            {
                name: `${EMOJIS.PRICE} ${MESSAGES.PAYMENT_INFO}`,
                value: `**Total:** $${ticketData.totalPrice}\n**Payment:** ${ticketData.paymentMethod}`,
                inline: false,
            },
            {
                name: `${EMOJIS.CLOCK} ${MESSAGES.ORDER_STATUS}`,
                value: `${MESSAGES.STATUS[ticketData.status as keyof typeof MESSAGES.STATUS] || ticketData.status}`,
                inline: false,
            }
        );

        return embed;
    }

    static createErrorEmbed(
        message: string,
        title: string = "Error"
    ): DiscordEmbedBuilder {
        return new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.ERROR} ${title}`)
            .setDescription(message)
            .setColor(COLORS.ERROR as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });
    }

    static createSuccessEmbed(
        message: string,
        title: string = "Success"
    ): DiscordEmbedBuilder {
        return new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.SUCCESS} ${title}`)
            .setDescription(message)
            .setColor(COLORS.SUCCESS as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });
    }

    static createHelpEmbed(): DiscordEmbedBuilder {
        const embed = new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.HELP} ${MESSAGES.HELP_TITLE}`)
            .setDescription(MESSAGES.HELP_DESCRIPTION)
            .setColor(COLORS.PRIMARY as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: MESSAGES.FOOTER.BRAND,
                iconURL:
                    process.env.BRAND_LOGO_URL ||
                    "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
            });

        Object.values(MESSAGES.COMMANDS).forEach(command => {
            embed.addFields({
                name: `${command.name}`,
                value: `**Description:** ${command.description}\n**Usage:** ${command.usage}`,
                inline: false,
            });
        });

        return embed;
    }

    static createLoadingEmbed(
        message: string = MESSAGES.LOADING
    ): DiscordEmbedBuilder {
        return new DiscordEmbedBuilder()
            .setTitle(`${EMOJIS.LOADING} ${message}`)
            .setColor(COLORS.INFO as ColorResolvable)
            .setTimestamp();
    }
}
