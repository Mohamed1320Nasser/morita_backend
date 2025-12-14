import {
    ServiceCategory,
    Service,
    PricingMethod,
} from "../types/discord.types";
import { discordConfig } from "../config/discord.config";
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";

/**
 * Utility function to chunk array into groups
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

export class PricingMessageBuilder {
    /**
     * Build header message with Morita branding and payment methods
     */

    /**
     * Build category message with toggle functionality
     */
    static buildCategoryMessage(
        category: ServiceCategory,
        services: Service[],
        isExpanded: boolean = false
    ): { content: string; components: ActionRowBuilder<ButtonBuilder>[] } {
        const arrow = isExpanded ? "▼" : "▶";
        const serviceList = isExpanded ? this.buildServiceList(services) : "";

        // Exact category header format from screenshot
        const content = `\`\`\`ansi
[1;33m${category.emoji} ${category.name} - Click Here[0m ${arrow}
${serviceList}
\`\`\``;

        // Create toggle button
        const toggleButton = new ButtonBuilder()
            .setCustomId(`pricing_category_${category.id}_toggle`)
            .setLabel(isExpanded ? "🔼 Hide Services" : "🔽 View Services")
            .setStyle(ButtonStyle.Secondary);

        const components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(toggleButton),
        ];

        // Add service buttons when expanded (max 25 services, 5 per row)
        if (isExpanded && services.length > 0) {
            const serviceButtons = this.buildServiceButtons(services);
            components.push(...serviceButtons);
        }

        return { content, components };
    }

    /**
     * Build grouped categories message (4 categories per message)
     */
    static buildGroupedCategoriesMessage(
        categories: ServiceCategory[],
        expandedCategoryId?: string
    ): { content: string; components: ActionRowBuilder<ButtonBuilder>[] } {
        const content = this.buildGroupedContent(
            categories,
            expandedCategoryId
        );
        const components = this.buildGroupedButtons(
            categories,
            expandedCategoryId
        );

        return { content, components };
    }

    /**
     * Build content for grouped categories with proper spacing
     */
    private static buildGroupedContent(
        categories: ServiceCategory[],
        expandedCategoryId?: string
    ): string {
        const lines: string[] = [];

        // Start with top border
        lines.push("╭─────────────────────────╮");

        categories.forEach((category, index) => {
            const isExpanded = expandedCategoryId === category.id;
            const arrow = isExpanded ? "▼" : "▶";

            // Add category line
            lines.push(
                `│  ${category.emoji} ${category.name} ${arrow}        │`
            );

            // Add services if expanded
            if (
                isExpanded &&
                category.services &&
                category.services.length > 0
            ) {
                category.services.forEach(service => {
                    const emoji = service.emoji || "🔹";
                    lines.push(`│    └─ ${emoji} ${service.name}     │`);
                });
            }

            // Add spacing between categories (except for last one)
            if (index < categories.length - 1) {
                lines.push("│                         │");
            }
        });

        // End with bottom border
        lines.push("╰─────────────────────────╯");

        return `\`\`\`ansi
${lines.join("\n")}
\`\`\``;
    }

    /**
     * Build buttons for grouped categories
     */
    private static buildGroupedButtons(
        categories: ServiceCategory[],
        expandedCategoryId?: string
    ): ActionRowBuilder<ButtonBuilder>[] {
        const components: ActionRowBuilder<ButtonBuilder>[] = [];

        // Create toggle buttons for each category
        categories.forEach(category => {
            const isExpanded = expandedCategoryId === category.id;
            const toggleButton = new ButtonBuilder()
                .setCustomId(`pricing_category_${category.id}_toggle`)
                .setLabel(isExpanded ? "🔼 Hide" : "🔽 View")
                .setStyle(ButtonStyle.Secondary);

            components.push(
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    toggleButton
                )
            );
        });

        return components;
    }

    /**
     * Build service list for expanded category - exact screenshot design
     */
    private static buildServiceList(services: Service[]): string {
        if (services.length === 0) {
            return "   [0;37m└─ No services available[0m";
        }

        // Exact design from screenshot: Icon + Name, then subtitle, then blank line
        const serviceList = services
            .map(service => {
                const emoji = service.emoji || "🔹";
                const name = service.name;
                return `[1;36m${emoji} ${name}[0m
[0;37m↓ Click or scroll down for more option. ↓[0m`;
            })
            .join("\n\n");

        return serviceList;
    }

    /**
     * Build service buttons for expanded category
     */
    private static buildServiceButtons(
        services: Service[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        const buttons: ActionRowBuilder<ButtonBuilder>[] = [];
        const maxServices = 15; // Professional limit for better UX
        const servicesPerRow = 3; // Better mobile view
        const showMoreThreshold = 12; // Show "Show More" button if more than 12 services

        // Limit services to max allowed
        const limitedServices = services.slice(0, maxServices);
        const hasMoreServices = services.length > maxServices;

        // Create buttons in rows of 3
        for (let i = 0; i < limitedServices.length; i += servicesPerRow) {
            const rowServices = limitedServices.slice(i, i + servicesPerRow);
            const row = new ActionRowBuilder<ButtonBuilder>();

            rowServices.forEach(service => {
                const emoji = service.emoji || "🔹";
                const button = new ButtonBuilder()
                    .setCustomId(`pricing_service_${service.id}_details`)
                    .setLabel(`${emoji} ${service.name}`)
                    .setStyle(ButtonStyle.Primary);

                row.addComponents(button);
            });

            buttons.push(row);
        }

        // Add "Show More" button if there are more services
        if (hasMoreServices) {
            const showMoreRow = new ActionRowBuilder<ButtonBuilder>();
            const showMoreButton = new ButtonBuilder()
                .setCustomId(
                    `pricing_show_more_${services[0]?.category?.id || "unknown"}`
                )
                .setLabel("📋 Show All Services")
                .setStyle(ButtonStyle.Secondary);

            showMoreRow.addComponents(showMoreButton);
            buttons.push(showMoreRow);
        }

        return buttons;
    }

    /**
     * Build service detail message with pricing tiers
     */
    static buildServiceDetailMessage(
        service: Service,
        pricingMethods: PricingMethod[]
    ): string {
        const pricingTiers = this.groupPricingMethods(pricingMethods);

        let message = `\`\`\`ansi
[1;33m${service.name}[0m
[1;37m${service.description}[0m

`;

        // Add pricing tiers
        for (const [tierName, methods] of Object.entries(pricingTiers)) {
            message += `[1;36m${tierName}[0m\n`;
            methods.forEach(method => {
                const price = this.formatPrice(
                    method.basePrice,
                    method.pricingUnit
                );
                message += `[1;37m${method.name} = ${price}[0m\n`;
            });
            message += "\n";
        }

        // Add upcharges/notes section
        message += `[1;31mNote:[0m [1;37mClick here for more information. ←[0m
[1;37m→ There will be upcharges if you don't have ethernet cable.[0m
[1;37m→ Service will be done via [1;34mPARSEC[0m[1;37m if the connection is good after we make test.[0m
[1;37m→ If your connection is not good enough, we also do [1;34mVPN[0m[1;37m services.[0m

\`\`\``;

        return message;
    }

    /**
     * Group pricing methods by account type or service tier
     */
    private static groupPricingMethods(
        pricingMethods: PricingMethod[]
    ): Record<string, PricingMethod[]> {
        const groups: Record<string, PricingMethod[]> = {};

        pricingMethods.forEach(method => {
            // Extract account type from method name (e.g., "Main Accounts - Parsec")
            const match = method.name.match(/^(.+?)\s+(?:-|–)\s+(.+)$/);
            if (match) {
                const [, accountType, deliveryMethod] = match;
                const key = `${accountType} - ${deliveryMethod}`;
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(method);
            } else {
                // Fallback for methods without clear grouping
                const key = "Standard";
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(method);
            }
        });

        return groups;
    }

    /**
     * Format price based on pricing unit
     */
    private static formatPrice(basePrice: number, pricingUnit: string): string {
        switch (pricingUnit) {
            case "FIXED":
                return `${basePrice}M`;
            case "PER_LEVEL":
                return `${basePrice}M per level`;
            case "PER_KILL":
                return `${basePrice}M per kill`;
            case "PER_ITEM":
                return `${basePrice}M per item`;
            default:
                return `${basePrice}M`;
        }
    }

    /**
     * Build footer message for pricing channel
     */
    static buildFooterMessage(): string {
        return `\`\`\`ansi
[1;33m╔══════════════════════════════════════════════════════════════════════════════╗
║  [1;37mNeed help? Use [1;34m/ticket[1;37m to open a support ticket                    ║
║  [1;37mPowered by [1;33mMorita Bot[1;37m • [1;34mhttps://morita-gaming.com[1;37m                    ║
╚══════════════════════════════════════════════════════════════════════════════╝\`\`\``;
    }
}
