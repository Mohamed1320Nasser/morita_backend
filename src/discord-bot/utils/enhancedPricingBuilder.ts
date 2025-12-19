import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
} from "discord.js";
import {
    ServiceCategory,
    Service,
    PricingMethod,
    PricingModifier,
} from "../types/discord.types";
import logger from "../../common/loggers";
import {
    getPaginatedPricingMethods,
    addPaginationFooter,
    createServiceActionButtonsWithPagination,
    PaginationOptions
} from "./pricingPagination";
import { DISCORD_LIMITS } from "../constants/discord-limits";
import { toNumber, formatPrice as formatPriceUtil, formatLargeNumber } from "../../common/utils/decimal.util";

/**
 * Options for building service details embeds
 */
export interface BuildOptions {
    compact?: boolean; // Use compact mode (reduced width, lighter shadows)
    useAnsi?: boolean; // Use ANSI colorization (default: false, Discord support limited)
    bannerUrl?: string; // Optional banner image URL
    categoryColor?: number; // Override embed color with category color
    page?: number; // Current page for pagination (0-indexed)
    itemsPerPage?: number; // Items per page (default: from DISCORD_LIMITS.PAGINATION.PRICING_ITEMS_PER_PAGE)
}

/**
 * Enhanced Pricing Message Builder
 * Creates beautiful 3D-styled messages for Discord pricing channel
 */
export class EnhancedPricingBuilder {
    /**
     * Format emoji for Discord API
     * Ensures custom Discord emoji have proper format: <:name:id> or <a:name:id>
     */
    private static formatEmojiForDiscord(emoji: string | null | undefined): string {
        if (!emoji) return "";

        const trimmed = String(emoji).trim();

        // Check if it's already in Discord custom emoji format with brackets
        if (trimmed.startsWith("<:") || trimmed.startsWith("<a:")) {
            return trimmed;
        }

        // Check if it's Discord custom emoji format without brackets
        // Formats: name:id or a:name:id
        const customEmojiMatch = trimmed.match(/^(a?):?(.+?):(\d+)$/);
        if (customEmojiMatch) {
            const animated = customEmojiMatch[1];
            const name = customEmojiMatch[2];
            const id = customEmojiMatch[3];
            // Wrap in angle brackets for Discord API
            return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
        }

        // It's a regular Unicode emoji, return as is
        return trimmed;
    }

    /**
     * Extract emoji name for display in text (placeholders don't support custom emoji)
     * For custom Discord emoji, returns just the name with a generic icon
     * For Unicode emoji, returns the emoji itself
     */
    private static getEmojiForPlaceholder(emoji: string | null | undefined): string {
        if (!emoji) return "📦";

        const trimmed = String(emoji).trim();

        // Check if it's a Discord custom emoji (with or without brackets)
        // Formats: <:name:id>, <a:name:id>, name:id, a:name:id
        const customEmojiMatch = trimmed.match(/^<?a?:?(.+?):(\d+)>?$/);
        if (customEmojiMatch) {
            // Extract just the emoji name and show with a generic game icon
            const emojiName = customEmojiMatch[1];
            return `🎮 ${emojiName}`;
        }

        // It's a regular Unicode emoji, return as is
        return trimmed;
    }
    // ANSI Color Gradient System for 3D Effects
    // Using proper Discord ANSI escape sequences with \u001b
    private static readonly ANSI = {
        // Light borders and highlights (avoid bright colors 90-97, use regular bold)
        BRIGHT_WHITE: "\u001b[1;37m",
        BRIGHT_CYAN: "\u001b[1;36m",
        BRIGHT_MAGENTA: "\u001b[1;35m",
        BRIGHT_YELLOW: "\u001b[1;33m",
        BRIGHT_GREEN: "\u001b[1;32m",
        BRIGHT_BLUE: "\u001b[1;34m",

        // Price highlights (use regular bold colors, not 90-97 range)
        BRIGHT_CYAN_96: "\u001b[1;36m", // Bold cyan for prices
        BRIGHT_YELLOW_93: "\u001b[1;33m", // Bold yellow/gold

        // Medium accents
        CYAN: "\u001b[0;36m",
        MAGENTA: "\u001b[0;35m",
        YELLOW: "\u001b[0;33m",
        GREEN: "\u001b[0;32m",

        // Dark shadows and depth (avoid 90-97 range, use regular colors)
        DARK_GRAY: "\u001b[0;30m", // Use black instead of gray (90 not supported)
        BLACK: "\u001b[0;30m",
        DARK_WHITE: "\u001b[0;37m",

        // Reset
        RESET: "\u001b[0m",
    };

    /**
     * Build category select menu message
     */
    static buildCategorySelectMenu(category: ServiceCategory): {
        content: string;
        components: ActionRowBuilder<StringSelectMenuBuilder>[];
    } {
        // No title text - only the dropdown placeholder will show
        const content = ``;

        // Get emoji for placeholder (custom emoji show as "🎮 Name", Unicode emoji show normally)
        const categoryEmojiPlaceholder = this.getEmojiForPlaceholder(category.emoji);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pricing_service_select_${category.id}`)
            .setPlaceholder(
                `${categoryEmojiPlaceholder} ${category.name} - Click Here`
            )
            .setMinValues(1)
            .setMaxValues(1);

        // Add all services as options (max 25 for Discord limit)
        const services = category.services || [];
        const maxServices = Math.min(services.length, 25);

        for (let i = 0; i < maxServices; i++) {
            const service = services[i];
            const label =
                service.name.length > 100
                    ? service.name.substring(0, 97) + "..."
                    : service.name;

            // Build option
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(service.id)
                .setDescription("Click here for more information");

            // Handle emoji - custom emoji need ID format, Unicode emoji can be string
            if (service.emoji) {
                const trimmed = String(service.emoji).trim();
                // Check if it's a custom Discord emoji
                const customEmojiMatch = trimmed.match(/^<?a?:?(.+?):(\d+)>?$/);
                if (customEmojiMatch) {
                    // Extract name and ID for custom emoji
                    const emojiName = customEmojiMatch[1];
                    const emojiId = customEmojiMatch[2];
                    // Set as emoji object with ID
                    option.setEmoji({ id: emojiId, name: emojiName });
                } else {
                    // It's a Unicode emoji, use as string
                    option.setEmoji(trimmed);
                }
            } else {
                option.setEmoji("🔹");
            }

            selectMenu.addOptions(option);
        }

        // If more than 25 services, add a "Show More" option
        if (services.length > 25) {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        `📋 View ${services.length - 25} more services...`
                    )
                    .setValue(`show_more_${category.id}`)
                    .setDescription("Use /services command to see all")
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
     * Build beautiful service details embed with 3D-styled pricing
     */
    /**
     * Build service info embed with pricing in MMOGoldHut style
     * (Clean Discord embed format with sections, no ANSI codes)
     */
    static buildServiceInfoEmbed(
        service: Service,
        options: BuildOptions = {}
    ): EmbedBuilder {
        try {
            const {
                compact = false,
                bannerUrl,
                categoryColor,
                page = 0,
                itemsPerPage = DISCORD_LIMITS.PAGINATION.PRICING_ITEMS_PER_PAGE
            } = options;

            // Use orange accent color like MMOGoldHut (#fca311)
            const embedColor = 0xfca311;

            // Get emoji for embed title (format custom emoji so Discord can render them)
            const serviceEmoji = this.formatEmojiForDiscord(service.emoji) || "⭐";

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`${serviceEmoji} ${service.name}`)
                .setDescription(
                    service.description || "Professional gaming service"
                )
                .setTimestamp()
                .setFooter({
                    text: "Morita Gaming Services • Select an option below",
                    iconURL:
                        "https://cdn.discordapp.com/icons/placeholder/morita-icon.png",
                });

        // Add service image as large image at bottom (like MMOGoldHut style)
        // Use property indexing to bypass ts-node cache issues
        const serviceImage = (service as any)['imageUrl'];
        logger.debug(`[EnhancedPricingBuilder] Service: ${service.name}, imageUrl: ${serviceImage || 'NOT SET'}`);
        if (serviceImage) {
            logger.debug(`[EnhancedPricingBuilder] Setting image: ${serviceImage}`);
            embed.setImage(serviceImage);
        } else if (bannerUrl) {
            // Fallback to banner if no service image
            logger.debug(`[EnhancedPricingBuilder] Using banner instead: ${bannerUrl}`);
            embed.setImage(bannerUrl);
        } else {
            logger.debug(`[EnhancedPricingBuilder] No image or banner available`);
        }

        // Add pricing sections if available
        // NOTE: Discord limit is 25 fields per embed
        if (service.pricingMethods && service.pricingMethods.length > 0) {
            // Get paginated pricing methods
            const pricingToShow = getPaginatedPricingMethods(
                service.pricingMethods,
                page,
                itemsPerPage
            );

            const totalPages = Math.ceil(service.pricingMethods.length / itemsPerPage);
            const hasMultiplePages = totalPages > 1;

            this.addPricingSectionsToEmbed(embed, pricingToShow);

            // Add pagination info to footer if multiple pages
            if (hasMultiplePages) {
                addPaginationFooter(
                    embed,
                    page,
                    totalPages,
                    service.pricingMethods.length
                );
            }
        }

        // Add service modifiers at the end (applies to ALL pricing methods)
        // Group modifiers by displayType for better organization
        if (service.serviceModifiers && service.serviceModifiers.length > 0) {
            // Group modifiers by display type
            const upcharges = service.serviceModifiers.filter(m => m.displayType === 'UPCHARGE');
            const notes = service.serviceModifiers.filter(m => m.displayType === 'NOTE');
            const warnings = service.serviceModifiers.filter(m => m.displayType === 'WARNING');
            const normal = service.serviceModifiers.filter(m => m.displayType === 'NORMAL' || !m.displayType);

            // Check if there are bulk discount modifiers
            const bulkDiscounts = notes.filter(m =>
                m.name.toLowerCase().includes('bulk') ||
                m.name.toLowerCase().includes('discount')
            );
            const otherNotes = notes.filter(m =>
                !m.name.toLowerCase().includes('bulk') &&
                !m.name.toLowerCase().includes('discount')
            );

            // Helper function to format modifiers
            const formatModifiers = (modifiers: any[], colorCode: string, icon: string) => {
                return modifiers.map(modifier => {
                    const sign = Number(modifier.value) >= 0 ? '+' : '';
                    const value = modifier.modifierType === 'PERCENTAGE'
                        ? `${sign}${modifier.value}%`
                        : `${sign}$${modifier.value}`;
                    return `\`\`\`ansi\n${colorCode}${icon} ${value} ${modifier.name}\u001b[0m\n\`\`\``;
                }).join('\n');
            };

            // Add Upcharges section (red)
            if (upcharges.length > 0) {
                embed.addFields({
                    name: "🔺 **Upcharges** (Additional Costs)",
                    value: formatModifiers(upcharges, '\u001b[31m', '🔺'),
                    inline: false,
                });
            }

            // Add Bulk Discounts section (green) if any
            if (bulkDiscounts.length > 0) {
                embed.addFields({
                    name: "💰 **Bulk Discounts**",
                    value: formatModifiers(bulkDiscounts, '\u001b[32m', '📝'),
                    inline: false,
                });
            }

            // Add Other Notes section (green) if any
            if (otherNotes.length > 0) {
                embed.addFields({
                    name: "📝 **Additional Notes**",
                    value: formatModifiers(otherNotes, '\u001b[32m', '📝'),
                    inline: false,
                });
            }

            // Add Warnings section (yellow)
            if (warnings.length > 0) {
                embed.addFields({
                    name: "⚠️ **Warnings**",
                    value: formatModifiers(warnings, '\u001b[33m', '⚠️'),
                    inline: false,
                });
            }

            // Add Other Modifiers section (yellow) for NORMAL type
            if (normal.length > 0) {
                embed.addFields({
                    name: "⚙️ **Available Modifiers**",
                    value: formatModifiers(normal, '\u001b[33m', '⚙️'),
                    inline: false,
                });
            }
        }

            return embed;
        } catch (error) {
            logger.error(`[EnhancedPricingBuilder] Error in buildServiceInfoEmbed for ${service.name}:`, error);
            throw error;
        }
    }

    /**
     * Add pricing sections to embed in MMOGoldHut style
     */
    private static addPricingSectionsToEmbed(embed: EmbedBuilder, pricingMethods: PricingMethod[]): void {
        try {
            logger.debug(`[addPricingSectionsToEmbed] Processing ${pricingMethods.length} pricing methods`);

            // Group pricing methods by type
            const groupedMethods = this.groupPricingMethodsByType(pricingMethods);

            // Discord limit: max 25 fields per embed
            const currentFieldCount = embed.data.fields?.length || 0;
            const availableFields = DISCORD_LIMITS.EMBED.MAX_FIELDS - currentFieldCount;
            let fieldsAdded = 0;

            logger.debug(`[addPricingSectionsToEmbed] Current fields: ${currentFieldCount}, Available: ${availableFields}`);

            // Add each group as a section (MMOGoldHut style with colored code blocks)
            for (const [groupName, methods] of Object.entries(groupedMethods)) {
                // Stop if we've reached the field limit
                if (fieldsAdded >= availableFields) {
                    logger.warn(`[addPricingSectionsToEmbed] Reached field limit, stopping at ${fieldsAdded} fields`);
                    break;
                }

                const items: string[] = [];

                for (const method of methods) {
                    const price = this.formatPriceNumber(method.basePrice);
                    const unit = this.formatPricingUnit(method.pricingUnit);

                // Format based on whether it has level ranges
                // Use ANSI color codes for MMOGoldHut-style colored text
                if (method.startLevel && method.endLevel) {
                    // Add extra spacing around the dash: "50  -  60" instead of "50-60"
                    const priceText = `${method.startLevel}  -  ${method.endLevel} = ${price} ${unit}`;
                    // Cyan color for level ranges
                    items.push(`\`\`\`ansi\n\u001b[36m${priceText}\u001b[0m\n\`\`\``);
                } else {
                    const name = method.name.length > 40 ? method.name.substring(0, 37) + "..." : method.name;
                    const priceText = `${name} = ${price} ${unit}`;
                    // Cyan color for prices
                    items.push(`\`\`\`ansi\n\u001b[36m${priceText}\u001b[0m\n\`\`\``);
                }
            }

            // Add section as embed field with spacing
            // Use # for big heading (MMOGoldHut style - much bolder!)
            const fieldValue = items.join('\n'); // Single newline - ANSI blocks already have padding
            if (fieldValue.length <= DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE) {
                embed.addFields({
                    name: `# ${groupName}`, // Big header with # symbol
                    value: fieldValue,
                    inline: false
                });
                fieldsAdded++;
            }
        }

        // Add upcharges section if any (only if we have room)
        if (fieldsAdded < availableFields) {
            const upcharges = this.extractUpcharges(pricingMethods);
            if (upcharges.length > 0) {
                const upchargeLines = upcharges.slice(0, 5).map(u => `⚠️ ${u}`);
                if (upcharges.length > 5) {
                    upchargeLines.push(`*+${upcharges.length - 5} more upcharges*`);
                }
                const upchargeValue = upchargeLines.join('\n');
                if (upchargeValue.length <= 1024) {
                    embed.addFields({
                        name: "⚠️ Additional Charges",
                        value: upchargeValue,
                        inline: false
                    });
                    fieldsAdded++;
                }
            }
        }

        // Add notes section if any (only if we have room)
        if (fieldsAdded < availableFields) {
            const notes = this.extractNotes(pricingMethods);
            if (notes.length > 0) {
                const noteLines = notes.slice(0, 5).map(n => `→ ${n}`);
                if (notes.length > 5) {
                    noteLines.push(`*+${notes.length - 5} more notes*`);
                }
                const noteValue = noteLines.join('\n');
                if (noteValue.length <= 1024) {
                    embed.addFields({
                        name: "📝 Important Notes",
                        value: noteValue,
                        inline: false
                    });
                    fieldsAdded++;
                }
            }
        }

        logger.debug(`[addPricingSectionsToEmbed] Added ${fieldsAdded} fields total`);
        } catch (error) {
            logger.error(`[addPricingSectionsToEmbed] Error adding pricing sections:`, error);
            logger.error(`[addPricingSectionsToEmbed] Pricing method count: ${pricingMethods.length}`);
            throw error;
        }
    }

    /**
     * Build service details embed WITH pricing table in fields
     * (Legacy method - ANSI codes won't render in embed fields)
     * @deprecated Use buildServiceInfoEmbed + buildMMOGoldHutStylePricing as message content instead
     */
    static buildServiceDetailsEmbed(
        service: Service,
        options: BuildOptions = {}
    ): EmbedBuilder {
        const { compact = false, bannerUrl, categoryColor } = options;

        // Determine embed color: category color > default cyan
        const embedColor = categoryColor || 0x00d9ff;

        // Get emoji for embed title (format custom emoji so Discord can render them)
        const serviceEmoji = this.formatEmojiForDiscord(service.emoji) || "⭐";

        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`${serviceEmoji} ${service.name}`)
            .setDescription(
                service.description || "Professional gaming service"
            )
            .setTimestamp()
            .setFooter({
                text: "Morita Gaming Services • Select an option below",
                iconURL:
                    "https://cdn.discordapp.com/icons/placeholder/morita-icon.png",
            });

        // Add service image as large image at bottom (like MMOGoldHut style)
        // Use property indexing to bypass ts-node cache issues
        const serviceImage = (service as any)['imageUrl'];
        logger.debug(`[EnhancedPricingBuilder] Service: ${service.name}, imageUrl: ${serviceImage || 'NOT SET'}`);
        if (serviceImage) {
            logger.debug(`[EnhancedPricingBuilder] Setting image: ${serviceImage}`);
            embed.setImage(serviceImage);
        } else if (bannerUrl) {
            // Fallback to banner if no service image
            logger.debug(`[EnhancedPricingBuilder] Using banner instead: ${bannerUrl}`);
            embed.setImage(bannerUrl);
        } else {
            logger.debug(`[EnhancedPricingBuilder] No image or banner available`);
        }

        // Add pricing table if available
        if (service.pricingMethods && service.pricingMethods.length > 0) {
            // Use new MMOGoldHut-style pricing display
            const pricingTable = this.buildMMOGoldHutStylePricing(
                service.pricingMethods
            );

            logger.debug(
                `[PricingBuilder:${service.name}] Generated MMOGoldHut-style pricing table (length=${pricingTable.length})`
            );

            embed.addFields({
                name: "💰 Pricing Information",
                value: pricingTable,
                inline: false,
            });
        } else {
            embed.addFields({
                name: "💰 Pricing Information",
                value: "```\n💬 Contact us for custom pricing\n```",
                inline: false,
            });
        }

        // Remove service details and payment options to save space
        // Focus only on pricing information

        return embed;
    }

    /**
     * Generic 3D border builder - replaces create3DTopBorder, create3DBottomBorder, create3DSideBorder
     * Supports ANSI colorization when useAnsi is true, otherwise uses pure Unicode
     */
    private static create3DBorder(
        type: "top" | "bottom" | "side" | "divider",
        content?: string,
        width: number = 56,
        indent: number = 0,
        useAnsi: boolean = false
    ): string[] | string {
        const safeWidth = Math.max(3, width);
        const indentStr = " ".repeat(Math.max(0, indent));
        const shadowOffset = " ".repeat(Math.max(0, indent + 2));

        // Box drawing characters
        const topLeft = "╔";
        const topRight = "╗";
        const bottomLeft = "╚";
        const bottomRight = "╝";
        const horizontal = "═";
        const vertical = "║";
        const dividerLeft = "╠";
        const dividerRight = "╣";

        // ANSI codes (only used if useAnsi is true)
        const borderColor = useAnsi ? this.ANSI.BRIGHT_WHITE : "";
        const accentColor = useAnsi ? this.ANSI.BRIGHT_CYAN : "";
        const shadowColor = useAnsi ? this.ANSI.DARK_GRAY : "";
        const reset = useAnsi ? this.ANSI.RESET : "";

        switch (type) {
            case "top": {
                const borderLine =
                    indentStr +
                    borderColor +
                    topLeft +
                    accentColor +
                    horizontal.repeat(Math.max(1, safeWidth - 2)) +
                    borderColor +
                    topRight +
                    reset;
                const shadowLine =
                    shadowOffset +
                    shadowColor +
                    topLeft +
                    horizontal.repeat(Math.max(1, safeWidth - 2)) +
                    topRight +
                    reset;
                return [shadowLine, borderLine];
            }

            case "bottom": {
                const borderLine =
                    indentStr +
                    borderColor +
                    bottomLeft +
                    accentColor +
                    horizontal.repeat(Math.max(1, safeWidth - 2)) +
                    borderColor +
                    bottomRight +
                    reset;
                const shadowLine =
                    shadowOffset +
                    shadowColor +
                    bottomLeft +
                    horizontal.repeat(Math.max(1, safeWidth - 2)) +
                    bottomRight +
                    reset;
                return [borderLine, shadowLine];
            }

            case "divider": {
                return (
                    indentStr +
                    borderColor +
                    dividerLeft +
                    accentColor +
                    horizontal.repeat(Math.max(1, safeWidth - 2)) +
                    borderColor +
                    dividerRight +
                    reset
                );
            }

            case "side": {
                if (!content) {
                    // Empty side border
                    return (
                        indentStr +
                        borderColor +
                        vertical +
                        reset +
                        " ".repeat(Math.max(0, safeWidth - 2)) +
                        borderColor +
                        vertical +
                        reset
                    );
                }

                // Ensure width is at least 4 (for borders)
                const contentWidth = Math.max(4, safeWidth);
                const maxContentLength = contentWidth - 4;
                const safeContent =
                    content.length > maxContentLength
                        ? content.substring(0, maxContentLength - 3) + "..."
                        : content;

                const padding = contentWidth - safeContent.length - 4;
                const leftPad = Math.max(0, Math.floor(padding / 2));
                const rightPad = Math.max(0, Math.ceil(padding / 2));

                return (
                    indentStr +
                    borderColor +
                    vertical +
                    reset +
                    " ".repeat(leftPad) +
                    safeContent +
                    " ".repeat(rightPad) +
                    borderColor +
                    vertical +
                    reset
                );
            }

            default:
                return "";
        }
    }

    /**
     * Create shadow layer using Unicode shading characters
     */
    private static createShadowLayer(
        type: "light" | "medium" | "dark" | "solid",
        width: number,
        offset: number = 2
    ): string {
        const offsetStr = " ".repeat(Math.max(0, offset));
        const shadowChars = {
            light: "░",
            medium: "▒",
            dark: "▓",
            solid: "█",
        };
        return offsetStr + shadowChars[type].repeat(Math.max(1, width));
    }

    // Legacy methods for backwards compatibility (delegate to generic method)
    private static create3DTopBorder(
        width: number,
        indent: number = 0
    ): string[] {
        return this.create3DBorder(
            "top",
            undefined,
            width,
            indent,
            false
        ) as string[];
    }

    private static create3DBottomBorder(
        width: number,
        indent: number = 0
    ): string[] {
        return this.create3DBorder(
            "bottom",
            undefined,
            width,
            indent,
            false
        ) as string[];
    }

    private static create3DSideBorder(
        content: string,
        width: number,
        indent: number = 0
    ): string {
        return this.create3DBorder(
            "side",
            content,
            width,
            indent,
            false
        ) as string;
    }

    /**
     * Create glowing price display with shadow layers (3D card effect)
     */
    private static createGlowingPrice(price: string, unit: string): string {
        // Create layered effect: shadow → glow → highlight
        // Shadow background (dark layer)
        const shadowBg =
            this.ANSI.DARK_GRAY +
            "█".repeat(price.length + 2) +
            this.ANSI.RESET;
        // Outer glow layer
        const outerGlow = this.ANSI.BRIGHT_CYAN + "▐" + this.ANSI.RESET;
        // Inner highlight with extra brightness
        const priceHighlight =
            this.ANSI.BRIGHT_CYAN_96 +
            this.ANSI.BRIGHT_WHITE +
            price +
            this.ANSI.RESET;
        // Unit text with subtle color
        const unitText = this.ANSI.DARK_WHITE + unit + this.ANSI.RESET;

        // Return layered price with glow effect
        return outerGlow + priceHighlight + outerGlow + " " + unitText;
    }

    /**
     * Calculate responsive width based on content size
     */
    private static calculateResponsiveWidth(
        pricingMethodsCount: number,
        compact: boolean = false
    ): number {
        if (compact) {
            return 40;
        }

        // Dynamic width based on content
        if (pricingMethodsCount <= 2) {
            return 40; // Compact for small lists
        } else if (pricingMethodsCount <= 5) {
            return 56; // Standard
        } else {
            return 64; // Wide for large lists
        }
    }

    /**
     * Build Enhanced 3D pricing table with MORE details
     * Shows: name, price, unit, modifiers info
     */
    private static buildUnicode3DPricingTable(
        pricingMethods: PricingMethod[],
        compact: boolean = false
    ): string {
        if (!pricingMethods || pricingMethods.length === 0) {
            return "```\nNo pricing available\n```";
        }

        const lines: string[] = [];
        const width = 32; // Slightly wider for more info

        lines.push("```");
        // Header
        lines.push("╔" + "═".repeat(width - 2) + "╗░");
        lines.push("║   💰 PRICING OPTIONS    ║▒");
        lines.push("╠" + "═".repeat(width - 2) + "╣▓");

        const MAX_LENGTH = 920;
        let currentLength = lines.join("\n").length;

        // Build detailed cards
        for (let i = 0; i < pricingMethods.length; i++) {
            const method = pricingMethods[i];
            const name = (method.name || "Standard").substring(0, 24);
            const price = this.formatPrice(method.basePrice);
            const unit = this.formatPricingUnit(method.pricingUnit || "FIXED");

            // Build card lines
            const cardLines: string[] = [];
            cardLines.push("╔" + "═".repeat(width - 2) + "╗░");

            // Name line
            const nameLine = `║ ▸ ${name}`;
            cardLines.push(nameLine + " ".repeat(width - nameLine.length - 1) + "║▒");

            // Price + Unit line
            const priceLine = `║ 💵 ${price} ${unit}`;
            cardLines.push(priceLine + " ".repeat(width - priceLine.length - 1) + "║▓");

            // Modifiers info (if any)
            if (method.modifiers && method.modifiers.length > 0) {
                const activeModifiers = method.modifiers.filter(m => m.active);
                if (activeModifiers.length > 0) {
                    const modLine = `║ ⚡ ${activeModifiers.length} modifier(s)`;
                    cardLines.push(modLine + " ".repeat(width - modLine.length - 1) + "║");
                }
            }

            cardLines.push("╚" + "═".repeat(width - 2) + "╝█");

            // Check length before adding
            const testResult = lines.concat(cardLines).join("\n");
            if (testResult.length + 20 > MAX_LENGTH && i > 0) {
                const moreText = `+${pricingMethods.length - i} more`;
                lines.push("║ " + moreText + " ".repeat(width - 3 - moreText.length) + "║");
                break;
            }

            // Add the card
            lines.push(...cardLines);
            currentLength = lines.join("\n").length;
        }

        lines.push("```");
        const result = lines.join("\n");

        // Safety fallback
        if (result.length > 1024) {
            logger.warn(`[EnhancedPricingBuilder] Too long (${result.length}), using simple`);
            return (
                "```\n💰 PRICING\n\n" +
                pricingMethods
                    .slice(0, 4)
                    .map(m => {
                        const unit = this.formatPricingUnit(m.pricingUnit || "FIXED");
                        return `▸ ${(m.name || "").substring(0, 20)}\n  ${this.formatPrice(m.basePrice)} ${unit}`;
                    })
                    .join("\n\n") +
                "\n```"
            );
        }

        return result;
    }

    /**
     * Build enhanced 3D-styled ANSI pricing table with card-style layout
     * Ensures the result fits within Discord's 1024 character limit per field value
     */
    /**
     * Build enhanced 3D-styled pricing table with card-style layout
     * NOTE: This method is deprecated - use buildUnicode3DPricingTable instead
     * Kept for backwards compatibility but no longer uses ANSI codes
     */
    private static buildEnhancedPricingTable(
        pricingMethods: PricingMethod[]
    ): string {
        // Legacy method - delegate to Unicode version since ANSI doesn't work in Discord embeds
        return this.buildUnicode3DPricingTable(pricingMethods, false);
    }

    /**

        // 3D Header Card with gradient borders
        const headerBorders = this.create3DTopBorder(width);
        lines.push(...headerBorders);

        // Header content with glowing accent
        const headerContent =
            this.ANSI.BRIGHT_MAGENTA +
            "💰" +
            this.ANSI.RESET +
            " " +
            this.ANSI.BRIGHT_YELLOW +
            "PRICING OPTIONS" +
            this.ANSI.RESET;
        lines.push(this.create3DSideBorder(headerContent, width));

        // Divider with gradient
        lines.push(
            this.ANSI.BRIGHT_WHITE +
                "╠" +
                this.ANSI.BRIGHT_CYAN +
                "═".repeat(width - 2) +
                this.ANSI.BRIGHT_WHITE +
                "╣" +
                this.ANSI.RESET
        );

        // Discord field value limit is 1024 characters
        // Reserve space for footer, borders, and code block markers (approximately 200 chars)
        const MAX_TABLE_LENGTH = 800;
        let currentLength = lines.join("\n").length;

        // Build 3D cards for each pricing method
        for (let index = 0; index < pricingMethods.length; index++) {
            const method = pricingMethods[index];
            const name = (method.name || "Standard").substring(0, 40);
            const price = this.formatPrice(method.basePrice);
            const unit = this.formatPricingUnit(method.pricingUnit || "FIXED");

            // Perspective effect: indent increases with each card
            const indent = Math.min(index * 1, 2);
            const cardWidth = Math.max(20, width - indent * 2); // Ensure minimum card width

            // Card top border with shadow
            const cardTop = this.create3DTopBorder(cardWidth, indent);

            // Method name with glow effect
            const nameContent =
                this.ANSI.BRIGHT_CYAN +
                "▸ " +
                this.ANSI.RESET +
                this.ANSI.BRIGHT_WHITE +
                this.padString(name, cardWidth - 10) +
                this.ANSI.RESET;
            const nameBorder = this.create3DSideBorder(
                nameContent,
                cardWidth,
                indent
            );

            // Glowing price display
            const glowingPrice = this.createGlowingPrice(price, unit);
            const priceContent = "  " + glowingPrice;
            const priceBorder = this.create3DSideBorder(
                priceContent,
                cardWidth,
                indent
            );

            // Modifiers row (optional) with accent
            let modifiersBorder = "";
            if (method.modifiers && method.modifiers.length > 0) {
                const modifiersContent =
                    "  " +
                    this.ANSI.BRIGHT_YELLOW +
                    "⚡" +
                    this.ANSI.RESET +
                    " " +
                    this.ANSI.DARK_WHITE +
                    `${method.modifiers.length} modifier(s) available` +
                    this.ANSI.RESET;
                modifiersBorder = this.create3DSideBorder(
                    modifiersContent,
                    cardWidth,
                    indent
                );
            }

            // Card bottom border
            const cardBottom = this.create3DBottomBorder(cardWidth, indent);

            // Calculate card block length
            const cardBlock =
                cardTop.join("\n") +
                "\n" +
                nameBorder +
                "\n" +
                priceBorder +
                "\n" +
                (modifiersBorder ? modifiersBorder + "\n" : "") +
                cardBottom.join("\n") +
                "\n" +
                (index < pricingMethods.length - 1 ? "\n" : "");

            const estimatedNewLength = currentLength + cardBlock.length + 50;

            // If adding this card would exceed the limit, truncate
            if (estimatedNewLength > MAX_TABLE_LENGTH && index > 0) {
                lines.push(
                    this.create3DSideBorder(
                        this.ANSI.DARK_WHITE +
                            `... and ${pricingMethods.length - index} more pricing option(s)` +
                            this.ANSI.RESET,
                        width
                    )
                );
                break;
            }

            // Add card to lines
            lines.push(...cardTop);
            lines.push(nameBorder);
            lines.push(priceBorder);
            if (modifiersBorder) {
                lines.push(modifiersBorder);
            }
            lines.push(...cardBottom);

            // Add spacing between cards (except last)
            if (index < pricingMethods.length - 1) {
                lines.push("");
            }

            currentLength = lines.join("\n").length;
        }

        // 3D Footer border
        const footerBorders = this.create3DBottomBorder(width);
        lines.push(...footerBorders);

        // Close ANSI code block on new line
        lines.push("");
        lines.push("```");

        const result = lines.join("\n");

        // Debug: Verify code block structure
        if (!result.startsWith("```ansi")) {
            logger.warn(
                "[EnhancedPricingBuilder] Pricing table missing ANSI code block start"
            );
        }
        if (!result.endsWith("```")) {
            logger.warn(
                "[EnhancedPricingBuilder] Pricing table missing code block end"
            );
        }

        // Log sample of ANSI codes for debugging
        const ansiSample = result.substring(0, 300).replace(/\n/g, "\\n");
        logger.debug(
            `[EnhancedPricingBuilder] ANSI sample (first 300 chars): ${ansiSample}`
        );

        // Final safety check - if still too long, truncate aggressively
        if (result.length > 1024) {
            logger.warn(
                `[EnhancedPricingBuilder] Pricing table too long (${result.length} chars), truncating`
            );
            // Return a simplified version with 3D styling
            const simplified = pricingMethods
                .slice(0, Math.min(3, pricingMethods.length))
                .map(method => {
                    const name = (method.name || "Standard").substring(0, 30);
                    const price = this.formatPrice(method.basePrice);
                    return (
                        this.ANSI.BRIGHT_CYAN +
                        "▸" +
                        this.ANSI.RESET +
                        " " +
                        this.ANSI.BRIGHT_WHITE +
                        name +
                        this.ANSI.RESET +
                        ": " +
                        this.createGlowingPrice(price, "")
                    );
                })
                .join("\n");

            const simplifiedResult =
                "```ansi\n" +
                this.ANSI.BRIGHT_YELLOW +
                "**Pricing Options:**" +
                this.ANSI.RESET +
                "\n" +
                simplified +
                (simplified.length > 850
                    ? "\n\n" +
                      this.ANSI.DARK_WHITE +
                      "*Use buttons to view full pricing*" +
                      this.ANSI.RESET
                    : "") +
                "\n```";

            return simplifiedResult.length > 1024
                ? simplifiedResult.substring(0, 1020) + "...\n```"
                : simplifiedResult;
        }

        return result;
    }

    /**
     * Build action buttons for service details
     * If paginationOptions are provided, includes pagination buttons
     */
    static buildServiceActionButtons(
        serviceId: string,
        categoryId: string,
        paginationOptions?: PaginationOptions
    ): ActionRowBuilder<ButtonBuilder>[] {
        // Use the pagination helper if pagination options are provided
        if (paginationOptions) {
            return createServiceActionButtonsWithPagination(
                serviceId,
                categoryId,
                paginationOptions
            );
        }

        // Legacy single row without pagination
        return [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
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
            )
        ];
    }

    /**
     * Build admin refresh button
     */
    static buildAdminRefreshButton(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("admin_refresh_pricing_channel")
                .setLabel("🔄 Refresh Pricing Channel")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔄")
        );
    }

    /**
     * Format price with proper currency using Intl.NumberFormat
     * Supports K/M abbreviations for large numbers
     *
     * @deprecated Use formatPrice from decimal.util.ts instead
     * Kept for backwards compatibility
     */
    private static formatPrice(price: any, currency: string = "USD"): string {
        const num = toNumber(price);

        if (num === 0 && price !== 0 && price !== '0') {
            return "Contact Us";
        }

        // Use Intl.NumberFormat for proper currency formatting
        const formatter = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        // Format based on price magnitude (preserve K/M abbreviations for readability)
        if (num >= 1000000) {
            const millions = num / 1000000;
            return formatter.format(millions).replace(/\.00$/, "") + "M";
        } else if (num >= 1000) {
            const thousands = num / 1000;
            return formatter.format(thousands).replace(/\.00$/, "") + "K";
        } else if (num < 1 && num > 0) {
            // For very small prices, use more decimal places
            const smallFormatter = new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: currency,
                minimumFractionDigits: 4,
                maximumFractionDigits: 4,
            });
            return smallFormatter.format(num);
        } else {
            return formatter.format(num);
        }
    }

    /**
     * Get currency emoji icon based on currency type
     */
    private static getCurrencyIcon(currency: string = "USD"): string {
        const icons: Record<string, string> = {
            USD: "💲",
            EUR: "€",
            GBP: "£",
            BTC: "₿",
            ETH: "Ξ",
            GOLD: "🪙",
            CRYPTO: "🪙",
        };
        return icons[currency] || "💲";
    }

    /**
     * Format pricing unit to human-readable text (MMOGoldHut style)
     */
    private static formatPricingUnit(unit: string): string {
        const units: Record<string, string> = {
            FIXED: "$/service",
            PER_LEVEL: "$/XP",
            PER_KILL: "$/kill",
            PER_ITEM: "$/item",
            PER_HOUR: "$/hour",
        };

        return units[unit] || unit.toLowerCase();
    }

    /**
     * Format price as plain number (MMOGoldHut style - no $ symbol)
     *
     * @deprecated Use formatPrice from decimal.util.ts instead
     * Kept for backwards compatibility
     */
    private static formatPriceNumber(price: any): string {
        const num = toNumber(price);

        if (num === 0 && price !== 0 && price !== '0') {
            return "Contact Us";
        }

        // Use the utility function for consistent formatting
        return formatPriceUtil(num);
    }

    /**
     * Pad string to specific length
     */
    private static padString(str: string, length: number): string {
        const safeLength = Math.max(0, length);
        if (!str || str.length >= safeLength) {
            return str ? str.substring(0, safeLength) : "";
        }
        return str + " ".repeat(safeLength - str.length);
    }

    /**
     * Create footer message with update timestamp
     */
    static buildFooterMessage(): string {
        const timestamp = new Date().toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        });

        return `\`\`\`ansi
[1;36m╔══════════════════════════════════════════════════════════════════════════════╗
[1;36m║[0m                                                                              [1;36m║[0m
[1;36m║[0m  [1;37mLast Updated: ${this.padString(timestamp, 58)}[0m  [1;36m║[0m
[1;36m║[0m  [0;37mFor support, open a ticket or contact an administrator[0m                   [1;36m║[0m
[1;36m║[0m                                                                              [1;36m║[0m
[1;36m╚══════════════════════════════════════════════════════════════════════════════╝
\`\`\``;
    }

    /**
     * ===================================================================
     * MMOGoldHut-Style Pricing Display Methods
     * ===================================================================
     * These methods create beautiful, rich pricing displays that match
     * the style of the old MMOGoldHut system with level ranges,
     * grouped pricing tiers, upcharges, and notes.
     */

    /**
     * Build MMOGoldHut-style pricing display with level ranges and rich formatting
     * This is the main method that creates the complete pricing display
     * Discord embed field limit: 1024 characters
     */
    static buildMMOGoldHutStylePricing(pricingMethods: PricingMethod[]): string {
        if (!pricingMethods || pricingMethods.length === 0) {
            return "```\n💬 Contact us for custom pricing\n```";
        }

        const MAX_LENGTH = 950; // Leave buffer for Discord's 1024 char limit
        const lines: string[] = [];
        const width = 50; // Reduced width for more compact display

        // Use ANSI code block for colors (works on Discord desktop)
        lines.push("```ansi");

        // Compact header with colored Unicode box-drawing
        lines.push(this.ANSI.BRIGHT_CYAN + "╔" + "═".repeat(width - 2) + "╗" + this.ANSI.RESET);
        lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + this.centerText(this.ANSI.BRIGHT_YELLOW + "💰 PRICING" + this.ANSI.RESET, width - 2) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
        lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);

        // Group pricing methods by type (e.g., "Main Accounts - Parsec", "Zerker Accounts - VPN")
        const groupedMethods = this.groupPricingMethodsByType(pricingMethods);
        let methodCount = 0;
        let totalMethods = pricingMethods.length;
        let truncated = false;

        for (const [groupName, methods] of Object.entries(groupedMethods)) {
            // Check if adding this group would exceed limit
            const estimatedLength = lines.join("\n").length + (groupName.length * 2) + (methods.length * 60);
            if (estimatedLength > MAX_LENGTH && methodCount > 0) {
                truncated = true;
                break;
            }

            // Group header (compact - no group name if same as method name)
            const truncatedGroupName = groupName.length > 40 ? groupName.substring(0, 37) + "..." : groupName;
            const headerPadding = Math.max(0, width - 5 - truncatedGroupName.length);
            lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + this.ANSI.BRIGHT_WHITE + truncatedGroupName + this.ANSI.RESET + " ".repeat(headerPadding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);

            // Display each method in the group
            for (const method of methods) {
                // Check length before adding each line
                if (lines.join("\n").length > MAX_LENGTH && methodCount > 0) {
                    truncated = true;
                    break;
                }

                const priceLine = this.formatPricingMethodLineANSI(method);
                // Strip ANSI codes for length calculation
                const strippedLine = priceLine.replace(/\u001b\[[\d;]+m/g, "");
                const padding = Math.max(0, width - 4 - strippedLine.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + priceLine + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
                methodCount++;
            }

            if (truncated) break;
        }

        // Show truncation message if needed
        if (truncated) {
            const remaining = totalMethods - methodCount;
            const msg = `+${remaining} more`;
            const msgPadding = Math.max(0, width - 4 - msg.length);
            lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + msg + " ".repeat(msgPadding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
        }

        // Display upcharges (compact, max 3)
        const upcharges = this.extractUpcharges(pricingMethods);
        if (upcharges.length > 0 && lines.join("\n").length < MAX_LENGTH - 200) {
            lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);
            const maxUpcharges = Math.min(3, upcharges.length);

            for (let i = 0; i < maxUpcharges; i++) {
                const upcharge = upcharges[i];
                // Truncate long upcharges
                const maxLen = width - 8;
                const truncated = upcharge.length > maxLen ? upcharge.substring(0, maxLen - 3) + "..." : upcharge;
                const padding = Math.max(0, width - 8 - truncated.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + this.ANSI.YELLOW + "⚠ " + this.ANSI.RESET + truncated + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
            }

            if (upcharges.length > 3) {
                const msg = `+${upcharges.length - 3} more upcharges`;
                const padding = Math.max(0, width - 4 - msg.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + msg + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
            }
        }

        // Display notes (compact, max 2)
        const notes = this.extractNotes(pricingMethods);
        if (notes.length > 0 && lines.join("\n").length < MAX_LENGTH - 150) {
            lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);
            const maxNotes = Math.min(2, notes.length);

            for (let i = 0; i < maxNotes; i++) {
                const note = notes[i];
                // Truncate long notes
                const maxLen = width - 8;
                const truncated = note.length > maxLen ? note.substring(0, maxLen - 3) + "..." : note;
                const padding = Math.max(0, width - 8 - truncated.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + this.ANSI.GREEN + "→ " + this.ANSI.RESET + truncated + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
            }

            if (notes.length > 2) {
                const msg = `+${notes.length - 2} more notes`;
                const padding = Math.max(0, width - 4 - msg.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + msg + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
            }
        }

        // Footer
        lines.push(this.ANSI.BRIGHT_CYAN + "╚" + "═".repeat(width - 2) + "╝" + this.ANSI.RESET);
        lines.push("```");

        const result = lines.join("\n");

        // Safety check - if still too long, return simple version
        if (result.length > 1024) {
            logger.warn(`[PricingBuilder] Table too long (${result.length} chars), using simple format`);
            return this.buildSimplePricingFallback(pricingMethods);
        }

        logger.debug(`[PricingBuilder] Table size: ${result.length} chars (${methodCount} methods shown)`);
        return result;
    }

    /**
     * Fallback for when pricing table is too long
     * Returns a simple list format
     */
    private static buildSimplePricingFallback(pricingMethods: PricingMethod[]): string {
        const lines: string[] = [];
        lines.push("```");
        lines.push("💰 PRICING OPTIONS");
        lines.push("─".repeat(40));

        const maxMethods = Math.min(8, pricingMethods.length);
        for (let i = 0; i < maxMethods; i++) {
            const method = pricingMethods[i];
            const price = this.formatPrice(method.basePrice);
            const unit = this.formatPricingUnit(method.pricingUnit);

            if (method.startLevel && method.endLevel) {
                lines.push(`${method.startLevel}-${method.endLevel}: ${price} ${unit}`);
            } else {
                const name = method.name.length > 25 ? method.name.substring(0, 22) + "..." : method.name;
                lines.push(`${name}: ${price} ${unit}`);
            }
        }

        if (pricingMethods.length > maxMethods) {
            lines.push(`...+${pricingMethods.length - maxMethods} more`);
        }

        lines.push("```");
        return lines.join("\n");
    }

    /**
     * Format a single pricing method line with level range (ANSI colored version)
     */
    private static formatPricingMethodLineANSI(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        // If level range exists, display it
        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            return `${this.ANSI.BRIGHT_CYAN}${method.startLevel}-${method.endLevel}${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            return `${this.ANSI.BRIGHT_CYAN}${method.startLevel}+${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        } else {
            // No level range, just show the name and price
            const name = method.name.substring(0, 30);
            return `${this.ANSI.BRIGHT_WHITE}${name}${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        }
    }

    /**
     * Format a single pricing method line with level range (clean version without ANSI)
     */
    private static formatPricingMethodLineClean(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        // If level range exists, display it
        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            return `${method.startLevel}-${method.endLevel} = $${price} ${unit}`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            return `${method.startLevel}+ = $${price} ${unit}`;
        } else {
            // No level range, just show the name and price
            const name = method.name.substring(0, 30);
            return `${name} = $${price} ${unit}`;
        }
    }

    /**
     * Format a single pricing method line with level range (ANSI version - deprecated)
     * @deprecated ANSI codes don't work reliably in Discord, use formatPricingMethodLineClean instead
     */
    private static formatPricingMethodLine(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        // If level range exists, display it
        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            const levelRange = `[1;96m${method.startLevel} - ${method.endLevel}[0m`;
            return `${levelRange} = [1;93m${price}[0m [0;37m${unit}[0m`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            const levelRange = `[1;96m${method.startLevel}+[0m`;
            return `${levelRange} = [1;93m${price}[0m [0;37m${unit}[0m`;
        } else {
            // No level range, just show the name and price
            const name = method.name.substring(0, 30);
            return `[1;96m${name}[0m = [1;93m${price}[0m [0;37m${unit}[0m`;
        }
    }

    /**
     * Group pricing methods by type (e.g., "Main Accounts - Parsec", "Zerker Accounts - VPN")
     */
    private static groupPricingMethodsByType(methods: PricingMethod[]): Record<string, PricingMethod[]> {
        const groups: Record<string, PricingMethod[]> = {};

        for (const method of methods) {
            // Extract group name from method name
            // If name contains " - ", use it to split (e.g., "Main Accounts - Parsec")
            // Otherwise, use the full name as the group
            let groupName: string;
            if (method.name.includes(" - ")) {
                groupName = method.name;
            } else {
                // Group by the first part of the name (before any numbers or special chars)
                groupName = method.name.split(/\d/)[0].trim() || method.name;
            }

            if (!groups[groupName]) {
                groups[groupName] = [];
            }

            groups[groupName].push(method);
        }

        return groups;
    }

    /**
     * Extract upcharges from modifiers
     */
    private static extractUpcharges(methods: PricingMethod[]): string[] {
        const upcharges: string[] = [];

        for (const method of methods) {
            if (method.modifiers) {
                for (const modifier of method.modifiers) {
                    if (modifier.displayType === 'UPCHARGE' ||
                        modifier.name.toLowerCase().includes('upcharge')) {
                        const upchargeText = `${modifier.name}: ${this.formatModifierValue(modifier)}`;
                        if (!upcharges.includes(upchargeText)) {
                            upcharges.push(upchargeText);
                        }
                    }
                }
            }
        }

        return upcharges;
    }

    /**
     * Extract notes from modifiers
     */
    private static extractNotes(methods: PricingMethod[]): string[] {
        const notes: string[] = [];

        for (const method of methods) {
            if (method.modifiers) {
                for (const modifier of method.modifiers) {
                    if (modifier.displayType === 'NOTE' ||
                        modifier.name.toLowerCase().includes('note')) {
                        if (!notes.includes(modifier.name)) {
                            notes.push(modifier.name);
                        }
                    }
                }
            }
        }

        return notes;
    }

    /**
     * Format modifier value for display
     */
    private static formatModifierValue(modifier: PricingModifier): string {
        if (modifier.modifierType === 'PERCENTAGE') {
            return `+${modifier.value}%`;
        } else {
            return `+${this.formatPrice(modifier.value)}`;
        }
    }

    /**
     * Center text within a given width
     */
    private static centerText(text: string, width: number): string {
        // Remove ANSI codes for accurate length calculation (both old and new format)
        const cleanText = text.replace(/\u001b\[[\d;]+m/g, "").replace(/\[[\d;]+m/g, "");
        const padding = Math.max(0, Math.floor((width - cleanText.length) / 2));
        const rightPadding = Math.max(0, width - cleanText.length - padding);
        return " ".repeat(padding) + text + " ".repeat(rightPadding);
    }
}
