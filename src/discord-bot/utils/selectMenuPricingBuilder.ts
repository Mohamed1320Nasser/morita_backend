import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
} from "discord.js";
import { ServiceCategory, Service } from "../types/discord.types";

export class SelectMenuPricingBuilder {
    // Header is now just the banner image - no text needed

    /**
     * Build category select menu with all services as options (MMOGoldHut style)
     */
    static buildCategorySelectMenu(category: ServiceCategory): {
        content: string;
        components: ActionRowBuilder<StringSelectMenuBuilder>[];
    } {
        // Format: "🍀 Megascale - Click Here" (exact screenshot format)
        const content = `**${category.emoji} ${category.name} - Click Here**`;

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pricing_service_select_${category.id}`)
            .setPlaceholder(`Select a ${category.name} service`)
            .setMinValues(1)
            .setMaxValues(1);

        // Add all services as options (pre-loaded, max 25 for Discord limit)
        const services = category.services || [];
        const maxServices = Math.min(services.length, 25);

        for (let i = 0; i < maxServices; i++) {
            const service = services[i];
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(service.name)
                    .setValue(service.id)
                    .setEmoji(service.emoji || "🔹")
            );
        }

        // If more than 25 services, add a "Show More" option
        if (services.length > 25) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`+${services.length - 25} more services...`)
                    .setValue(`show_more_${category.id}`)
                    .setEmoji("📋")
            );
        }

        return {
            content,
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    selectMenu
                ),
            ],
        };
    }

    /**
     * Build service details embed for ephemeral response
     */
    static buildServiceDetailsEmbed(service: Service): any {
        const { EmbedBuilder } = require("discord.js");
        const { COLORS } = require("../constants/colors");

        const embed = new EmbedBuilder()
            .setColor(COLORS.BRONZE)
            .setTitle(`${service.emoji} ${service.name}`)
            .setDescription(
                service.description || "Professional gaming service"
            )
            .setThumbnail(
                "https://cdn.discordapp.com/attachments/1234567890/1234567890/morita-logo.png"
            )
            .setFooter({
                text: "Morita Gaming Services",
                iconURL:
                    "https://cdn.discordapp.com/attachments/1234567890/1234567890/morita-logo.png",
            })
            .setTimestamp();

        // Add pricing information if available
        if (service.pricingMethods && service.pricingMethods.length > 0) {
            const pricingTable = this.buildPricingTable(service.pricingMethods);
            embed.addFields({
                name: "💰 Pricing",
                value: `\`\`\`ansi\n${pricingTable}\n\`\`\``,
                inline: false,
            });
        }

        // Add service info
        embed.addFields(
            {
                name: "📋 Service Info",
                value: `**Category:** ${service.category?.name || "N/A"}\n**Status:** ${service.active ? "✅ Active" : "❌ Inactive"}\n**Type:** Standard`,
                inline: true,
            },
            {
                name: "💳 Payment Methods",
                value: "PayPal • Venmo • Discover • OSRS Gold • Bitcoin • Zelle • Other Crypto",
                inline: true,
            }
        );

        // Add service description if available
        if (
            service.description &&
            service.description !== "Professional gaming service"
        ) {
            embed.addFields({
                name: "📝 Description",
                value: service.description,
                inline: false,
            });
        }

        return embed;
    }

    /**
     * Build ANSI pricing table
     */
    private static buildPricingTable(pricingMethods: any[]): string {
        if (!pricingMethods || pricingMethods.length === 0) {
            return "[1;37mNo pricing information available[0m";
        }

        const lines: string[] = [];
        lines.push(
            "[1;33m╔══════════════════════════════════════════════════════════════╗[0m"
        );
        lines.push(
            "[1;33m║[0m [1;36mPRICING INFORMATION[0m                                    [1;33m║[0m"
        );
        lines.push(
            "[1;33m╠══════════════════════════════════════════════════════════════╣[0m"
        );

        pricingMethods.forEach((method, index) => {
            const name = method.name || "Standard";
            const price = this.formatPrice(method.basePrice);
            const unit = method.unit || "per item";

            lines.push(
                `[1;33m║[0m [1;37m${name.padEnd(30)}[0m [1;32m${price.padStart(15)}[0m [1;33m║[0m`
            );
            lines.push(`[1;33m║[0m [0;37m${unit.padEnd(47)}[0m [1;33m║[0m`);

            if (index < pricingMethods.length - 1) {
                lines.push(
                    "[1;33m║[0m                                                      [1;33m║[0m"
                );
            }
        });

        lines.push(
            "[1;33m╚══════════════════════════════════════════════════════════════╝[0m"
        );

        return lines.join("\n");
    }

    /**
     * Format price with proper currency
     */
    private static formatPrice(price: any): string {
        if (typeof price === "string") {
            price = parseFloat(price);
        }
        if (isNaN(price)) {
            return "N/A";
        }
        return `${price.toFixed(0)}M`;
    }
}
