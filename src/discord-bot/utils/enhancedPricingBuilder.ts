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
    PaginationOptions,
    getTotalGroups
} from "./pricingPagination";
import { DISCORD_LIMITS } from "../constants/discord-limits";
import { toNumber, formatPrice as formatPriceUtil, formatLargeNumber } from "../../common/utils/decimal.util";

/**
 * Format shortcuts for display - returns first shortcut or empty string
 * @param shortcuts - JSON array of shortcuts or null
 * @returns Formatted shortcut string like "(agi)" or ""
 */
function formatShortcut(shortcuts: any): string {
    if (!shortcuts || !Array.isArray(shortcuts) || shortcuts.length === 0) {
        return "";
    }
    // Get first shortcut, lowercase
    const shortcut = shortcuts[0]?.toString().toLowerCase();
    return shortcut ? ` (${shortcut})` : "";
}

export interface BuildOptions {
    compact?: boolean; 
    useAnsi?: boolean; 
    bannerUrl?: string; 
    categoryColor?: number; 
    page?: number; 
    itemsPerPage?: number; 
}

export class EnhancedPricingBuilder {

    /**
     * Generate example calculator commands for methods with shortcuts (max 3)
     * Returns array of example commands like ["!s gn 1-20", "!s fr 50-60"]
     */
    private static generateExampleCommands(service: Service): string[] {
        const commands: string[] = [];
        const MAX_COMMANDS = 3;

        if (!service.pricingMethods || service.pricingMethods.length === 0) {
            return commands;
        }

        // Determine command prefix based on pricing unit
        const getCommandPrefix = (pricingUnit: string): string => {
            switch (pricingUnit) {
                case 'PER_LEVEL':
                    return '!s'; // Skills
                case 'PER_KILL':
                    return '!p'; // PvM/Bossing
                case 'PER_ITEM':
                    return '!m'; // Minigames
                case 'FIXED':
                    return '!q'; // Quests
                default:
                    return '!s';
            }
        };

        // Generate example value based on pricing unit and method
        const getExampleValue = (method: any): string => {
            if (method.startLevel && method.endLevel) {
                return `${method.startLevel}-${method.endLevel}`;
            }
            switch (method.pricingUnit) {
                case 'PER_LEVEL':
                    return '70-99';
                case 'PER_KILL':
                    return '10';
                case 'PER_ITEM':
                    return '100';
                case 'FIXED':
                    return '';
                default:
                    return '1';
            }
        };

        for (const method of service.pricingMethods) {
            if (commands.length >= MAX_COMMANDS) break;

            // Get shortcut - prefer method shortcut, fallback to service shortcut
            const shortcut = formatShortcut(method.shortcuts).replace(/[() ]/g, '') ||
                             formatShortcut(service.shortcuts).replace(/[() ]/g, '');

            if (!shortcut) continue;

            const prefix = getCommandPrefix(method.pricingUnit);
            const value = getExampleValue(method);

            const command = value ? `${prefix} ${shortcut} ${value}` : `${prefix} ${shortcut}`;

            // Avoid duplicate commands
            if (!commands.includes(command)) {
                commands.push(command);
            }
        }

        return commands;
    }

    private static formatEmojiForDiscord(emoji: string | null | undefined): string {
        if (!emoji) return "";

        const trimmed = String(emoji).trim();

        if (trimmed.startsWith("<:") || trimmed.startsWith("<a:")) {
            return trimmed;
        }

        const customEmojiMatch = trimmed.match(/^(a?):?(.+?):(\d+)$/);
        if (customEmojiMatch) {
            const animated = customEmojiMatch[1];
            const name = customEmojiMatch[2];
            const id = customEmojiMatch[3];
            
            return animated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
        }

        return trimmed;
    }

    private static getEmojiForPlaceholder(emoji: string | null | undefined): string {
        if (!emoji) return "📦";

        const trimmed = String(emoji).trim();

        const customEmojiMatch = trimmed.match(/^<?a?:?(.+?):(\d+)>?$/);
        if (customEmojiMatch) {
            
            const emojiName = customEmojiMatch[1];
            return `🎮 ${emojiName}`;
        }

        return trimmed;
    }

    private static readonly ANSI = {
        
        BRIGHT_WHITE: "\u001b[1;37m",
        BRIGHT_CYAN: "\u001b[1;36m",
        BRIGHT_MAGENTA: "\u001b[1;35m",
        BRIGHT_YELLOW: "\u001b[1;33m",
        BRIGHT_GREEN: "\u001b[1;32m",
        BRIGHT_BLUE: "\u001b[1;34m",

        BRIGHT_CYAN_96: "\u001b[1;36m", 
        BRIGHT_YELLOW_93: "\u001b[1;33m", 

        CYAN: "\u001b[0;36m",
        MAGENTA: "\u001b[0;35m",
        YELLOW: "\u001b[0;33m",
        GREEN: "\u001b[0;32m",

        DARK_GRAY: "\u001b[0;30m", 
        BLACK: "\u001b[0;30m",
        DARK_WHITE: "\u001b[0;37m",

        RESET: "\u001b[0m",
    };

    static buildCategorySelectMenu(category: ServiceCategory): {
        content: string;
        components: ActionRowBuilder<StringSelectMenuBuilder>[];
    } {
        
        const content = ``;

        const categoryEmojiPlaceholder = this.getEmojiForPlaceholder(category.emoji);

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`pricing_service_select_${category.id}`)
            .setPlaceholder(
                `${categoryEmojiPlaceholder} ${category.name} - Click Here`
            )
            .setMinValues(1)
            .setMaxValues(1);

        const services = category.services || [];
        const maxServices = Math.min(services.length, 25);

        for (let i = 0; i < maxServices; i++) {
            const service = services[i];
            // Add shortcut to service name if available
            const shortcut = formatShortcut(service.shortcuts);
            const nameWithShortcut = `${service.name}${shortcut}`;
            const label =
                nameWithShortcut.length > 100
                    ? nameWithShortcut.substring(0, 97) + "..."
                    : nameWithShortcut;

            const option = new StringSelectMenuOptionBuilder()
                .setLabel(label)
                .setValue(service.id)
                .setDescription("Click here for more information");

            if (service.emoji) {
                const trimmed = String(service.emoji).trim();
                
                const customEmojiMatch = trimmed.match(/^<?a?:?(.+?):(\d+)>?$/);
                if (customEmojiMatch) {
                    
                    const emojiName = customEmojiMatch[1];
                    const emojiId = customEmojiMatch[2];
                    
                    option.setEmoji({ id: emojiId, name: emojiName });
                } else {
                    
                    option.setEmoji(trimmed);
                }
            } else {
                option.setEmoji("🔹");
            }

            selectMenu.addOptions(option);
        }

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

            const embedColor = 0xfca311;

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

        const serviceImage = (service as any)['imageUrl'];
        logger.debug(`[EnhancedPricingBuilder] Service: ${service.name}, imageUrl: ${serviceImage || 'NOT SET'}`);
        if (serviceImage) {
            logger.debug(`[EnhancedPricingBuilder] Setting image: ${serviceImage}`);
            embed.setImage(serviceImage);
        } else if (bannerUrl) {
            
            logger.debug(`[EnhancedPricingBuilder] Using banner instead: ${bannerUrl}`);
            embed.setImage(bannerUrl);
        } else {
            logger.debug(`[EnhancedPricingBuilder] No image or banner available`);
        }

        if (service.pricingMethods && service.pricingMethods.length > 0) {
            // Get paginated methods - now paginates by GROUPS, not individual methods
            const pricingToShow = getPaginatedPricingMethods(
                service.pricingMethods,
                page,
                itemsPerPage
            );

            // Calculate total pages based on GROUP count, not method count
            const totalGroups = getTotalGroups(service.pricingMethods);
            const totalPages = Math.ceil(totalGroups / itemsPerPage);
            const hasMultiplePages = totalPages > 1;

            this.addPricingSectionsToEmbed(embed, pricingToShow);

            if (hasMultiplePages) {
                addPaginationFooter(
                    embed,
                    page,
                    totalPages,
                    totalGroups // Show group count, not method count
                );
            }
        }

        if (service.serviceModifiers && service.serviceModifiers.length > 0) {
            
            const upcharges = service.serviceModifiers.filter(m => m.displayType === 'UPCHARGE');
            const discounts = service.serviceModifiers.filter(m => m.displayType === 'DISCOUNT');
            const notes = service.serviceModifiers.filter(m => m.displayType === 'NOTE');
            const warnings = service.serviceModifiers.filter(m => m.displayType === 'WARNING');
            const normal = service.serviceModifiers.filter(m => m.displayType === 'NORMAL' || !m.displayType);

            const formatModifiers = (modifiers: any[], defaultColorCode: string, defaultIcon: string) => {
                return modifiers.map(modifier => {
                    const sign = Number(modifier.value) >= 0 ? '+' : '';
                    const value = modifier.modifierType === 'PERCENTAGE'
                        ? `${sign}${modifier.value}%`
                        : `${sign}$${Math.abs(Number(modifier.value)).toFixed(2)}`;

                    let colorCode = defaultColorCode;
                    let icon = defaultIcon;

                    if (modifier.displayType === 'UPCHARGE') {
                        colorCode = '\u001b[31m'; 
                        icon = '🔺';
                    } else if (modifier.displayType === 'DISCOUNT') {
                        colorCode = '\u001b[32m'; 
                        icon = '💰';
                    } else if (modifier.displayType === 'NOTE') {
                        colorCode = '\u001b[32m'; 
                        icon = '📝';
                    } else if (modifier.displayType === 'WARNING') {
                        colorCode = '\u001b[33m'; 
                        icon = '⚠️';
                    }

                    return `\`\`\`ansi\n${colorCode}${icon} ${value} ${modifier.name}\u001b[0m\n\`\`\``;
                }).join('\n');
            };

            if (upcharges.length > 0) {
                embed.addFields({
                    name: "🔺 **General Upcharges** (Applies to All Methods)",
                    value: formatModifiers(upcharges, '\u001b[31m', '🔺'),
                    inline: false,
                });
            }

            if (discounts.length > 0) {
                embed.addFields({
                    name: "💰 **Discounts** (Applies to All Methods)",
                    value: formatModifiers(discounts, '\u001b[32m', '💰'),
                    inline: false,
                });
            }

            if (notes.length > 0) {
                embed.addFields({
                    name: "📝 **Additional Notes** (Applies to All Methods)",
                    value: formatModifiers(notes, '\u001b[32m', '📝'),
                    inline: false,
                });
            }

            if (warnings.length > 0) {
                embed.addFields({
                    name: "⚠️ **General Warnings** (Applies to All Methods)",
                    value: formatModifiers(warnings, '\u001b[33m', '⚠️'),
                    inline: false,
                });
            }

            if (normal.length > 0) {
                embed.addFields({
                    name: "⚙️ **Available Modifiers** (Applies to All Methods)",
                    value: formatModifiers(normal, '\u001b[33m', '⚙️'),
                    inline: false,
                });
            }
        }

        // Add example calculator commands (max 3)
        const exampleCommands = this.generateExampleCommands(service);
        if (exampleCommands.length > 0) {
            embed.addFields({
                name: "🧮 Calculator Commands",
                value: exampleCommands.map(cmd => `\`${cmd}\``).join(', '),
                inline: false,
            });
        }

            return embed;
        } catch (error) {
            logger.error(`[EnhancedPricingBuilder] Error in buildServiceInfoEmbed for ${service.name}:`, error);
            throw error;
        }
    }

    private static addPricingSectionsToEmbed(embed: EmbedBuilder, pricingMethods: PricingMethod[]): void {
        try {
            logger.debug(`[addPricingSectionsToEmbed] Processing ${pricingMethods.length} pricing methods`);

            const groupedMethods = this.groupPricingMethodsByType(pricingMethods);

            const currentFieldCount = embed.data.fields?.length || 0;
            const availableFields = DISCORD_LIMITS.EMBED.MAX_FIELDS - currentFieldCount;
            let fieldsAdded = 0;

            logger.debug(`[addPricingSectionsToEmbed] Current fields: ${currentFieldCount}, Available: ${availableFields}`);

            for (const [groupName, methods] of Object.entries(groupedMethods)) {
                
                if (fieldsAdded >= availableFields) {
                    logger.warn(`[addPricingSectionsToEmbed] Reached field limit, stopping at ${fieldsAdded} fields`);
                    break;
                }

                const items: string[] = [];

                const isRealGroup = methods.length > 1 || (methods.length === 1 && methods[0].groupName);

                if (isRealGroup && methods[0].groupName) {
                    
                    const groupLines: string[] = [];

                    for (const method of methods) {
                        const price = this.formatPriceNumber(method.basePrice);
                        const unit = this.formatPricingUnit(method.pricingUnit);

                        if (method.startLevel && method.endLevel) {
                            const priceText = `${method.startLevel}  -  ${method.endLevel} = ${price} ${unit}`;
                            groupLines.push(`\u001b[36m${priceText}\u001b[0m`);
                        } else {
                            const name = method.name.length > 40 ? method.name.substring(0, 37) + "..." : method.name;
                            const priceText = `${name} = ${price} ${unit}`;
                            groupLines.push(`\u001b[36m${priceText}\u001b[0m`);
                        }

                        if (method.modifiers && method.modifiers.length > 0) {
                            const activeModifiers = method.modifiers.filter(m => m.active);
                            for (const modifier of activeModifiers) {
                                const sign = Number(modifier.value) >= 0 ? '+' : '';
                                const value = modifier.modifierType === 'PERCENTAGE'
                                    ? `${sign}${modifier.value}%`
                                    : `${sign}$${Math.abs(Number(modifier.value)).toFixed(2)}`;

                                let colorCode = '\u001b[33m';
                                let icon = '⚙️';

                                if (modifier.displayType === 'UPCHARGE') {
                                    colorCode = '\u001b[31m';
                                    icon = '🔺';
                                } else if (modifier.displayType === 'DISCOUNT') {
                                    colorCode = '\u001b[32m';
                                    icon = '💰';
                                } else if (modifier.displayType === 'NOTE') {
                                    colorCode = '\u001b[32m';
                                    icon = '📝';
                                } else if (modifier.displayType === 'WARNING') {
                                    colorCode = '\u001b[33m';
                                    icon = '⚠️';
                                }

                                const nameBox = `${colorCode}[ ${modifier.name} ]\u001b[0m`;
                                const valueBox = `${colorCode}[ ${icon} ${value} ]\u001b[0m`;
                                const modifierText = `  ${nameBox}  ${valueBox}`;
                                groupLines.push(modifierText);
                            }
                        }
                    }

                    items.push(`\`\`\`ansi\n${groupLines.join('\n')}\n\`\`\``);

                } else {
                    
                    for (const method of methods) {
                        const price = this.formatPriceNumber(method.basePrice);
                        const unit = this.formatPricingUnit(method.pricingUnit);

                        if (method.startLevel && method.endLevel) {
                            const priceText = `${method.startLevel}  -  ${method.endLevel} = ${price} ${unit}`;
                            items.push(`\`\`\`ansi\n\u001b[36m${priceText}\u001b[0m\n\`\`\``);
                        } else {
                            const name = method.name.length > 40 ? method.name.substring(0, 37) + "..." : method.name;
                            const priceText = `${name} = ${price} ${unit}`;
                            items.push(`\`\`\`ansi\n\u001b[36m${priceText}\u001b[0m\n\`\`\``);
                        }

                        if (method.modifiers && method.modifiers.length > 0) {
                            const activeModifiers = method.modifiers.filter(m => m.active);
                            for (const modifier of activeModifiers) {
                                const sign = Number(modifier.value) >= 0 ? '+' : '';
                                const value = modifier.modifierType === 'PERCENTAGE'
                                    ? `${sign}${modifier.value}%`
                                    : `${sign}$${Math.abs(Number(modifier.value)).toFixed(2)}`;

                                let colorCode = '\u001b[33m';
                                let icon = '⚙️';

                                if (modifier.displayType === 'UPCHARGE') {
                                    colorCode = '\u001b[31m';
                                    icon = '🔺';
                                } else if (modifier.displayType === 'DISCOUNT') {
                                    colorCode = '\u001b[32m';
                                    icon = '💰';
                                } else if (modifier.displayType === 'NOTE') {
                                    colorCode = '\u001b[32m';
                                    icon = '📝';
                                } else if (modifier.displayType === 'WARNING') {
                                    colorCode = '\u001b[33m';
                                    icon = '⚠️';
                                }

                                const nameBox = `${colorCode}[ ${modifier.name} ]\u001b[0m`;
                                const valueBox = `${colorCode}[ ${icon} ${value} ]\u001b[0m`;
                                const modifierText = `  ${nameBox}  ${valueBox}`;
                                items.push(`\`\`\`ansi\n${modifierText}\n\`\`\``);
                            }
                        }
                    }
                }

                const fieldValue = items.join('\n');
                if (fieldValue.length <= DISCORD_LIMITS.EMBED.MAX_FIELD_VALUE) {
                    // Add shortcut to group/method name if available
                    const methodShortcut = methods[0]?.shortcuts ? formatShortcut(methods[0].shortcuts) : "";
                    const displayName = `# ${groupName}${methodShortcut}`;

                    embed.addFields({
                        name: displayName,
                        value: fieldValue,
                        inline: false
                    });
                    fieldsAdded++;
                }
            }

        logger.debug(`[addPricingSectionsToEmbed] Added ${fieldsAdded} fields total`);
        } catch (error) {
            logger.error(`[addPricingSectionsToEmbed] Error adding pricing sections:`, error);
            logger.error(`[addPricingSectionsToEmbed] Pricing method count: ${pricingMethods.length}`);
            throw error;
        }
    }

    static buildServiceDetailsEmbed(
        service: Service,
        options: BuildOptions = {}
    ): EmbedBuilder {
        const { compact = false, bannerUrl, categoryColor } = options;

        const embedColor = categoryColor || 0x00d9ff;

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

        const serviceImage = (service as any)['imageUrl'];
        logger.debug(`[EnhancedPricingBuilder] Service: ${service.name}, imageUrl: ${serviceImage || 'NOT SET'}`);
        if (serviceImage) {
            logger.debug(`[EnhancedPricingBuilder] Setting image: ${serviceImage}`);
            embed.setImage(serviceImage);
        } else if (bannerUrl) {
            
            logger.debug(`[EnhancedPricingBuilder] Using banner instead: ${bannerUrl}`);
            embed.setImage(bannerUrl);
        } else {
            logger.debug(`[EnhancedPricingBuilder] No image or banner available`);
        }

        if (service.pricingMethods && service.pricingMethods.length > 0) {
            
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

        return embed;
    }

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

        const topLeft = "╔";
        const topRight = "╗";
        const bottomLeft = "╚";
        const bottomRight = "╝";
        const horizontal = "═";
        const vertical = "║";
        const dividerLeft = "╠";
        const dividerRight = "╣";

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

    private static createGlowingPrice(price: string, unit: string): string {

        const shadowBg =
            this.ANSI.DARK_GRAY +
            "█".repeat(price.length + 2) +
            this.ANSI.RESET;
        
        const outerGlow = this.ANSI.BRIGHT_CYAN + "▐" + this.ANSI.RESET;
        
        const priceHighlight =
            this.ANSI.BRIGHT_CYAN_96 +
            this.ANSI.BRIGHT_WHITE +
            price +
            this.ANSI.RESET;
        
        const unitText = this.ANSI.DARK_WHITE + unit + this.ANSI.RESET;

        return outerGlow + priceHighlight + outerGlow + " " + unitText;
    }

    private static calculateResponsiveWidth(
        pricingMethodsCount: number,
        compact: boolean = false
    ): number {
        if (compact) {
            return 40;
        }

        if (pricingMethodsCount <= 2) {
            return 40; 
        } else if (pricingMethodsCount <= 5) {
            return 56; 
        } else {
            return 64; 
        }
    }

    private static buildUnicode3DPricingTable(
        pricingMethods: PricingMethod[],
        compact: boolean = false
    ): string {
        if (!pricingMethods || pricingMethods.length === 0) {
            return "```\nNo pricing available\n```";
        }

        const lines: string[] = [];
        const width = 32; 

        lines.push("```");
        
        lines.push("╔" + "═".repeat(width - 2) + "╗░");
        lines.push("║   💰 PRICING OPTIONS    ║▒");
        lines.push("╠" + "═".repeat(width - 2) + "╣▓");

        const MAX_LENGTH = 920;
        let currentLength = lines.join("\n").length;

        for (let i = 0; i < pricingMethods.length; i++) {
            const method = pricingMethods[i];
            const name = (method.name || "Standard").substring(0, 24);
            const price = this.formatPrice(method.basePrice);
            const unit = this.formatPricingUnit(method.pricingUnit || "FIXED");

            const cardLines: string[] = [];
            cardLines.push("╔" + "═".repeat(width - 2) + "╗░");

            const nameLine = `║ ▸ ${name}`;
            cardLines.push(nameLine + " ".repeat(width - nameLine.length - 1) + "║▒");

            const priceLine = `║ 💵 ${price} ${unit}`;
            cardLines.push(priceLine + " ".repeat(width - priceLine.length - 1) + "║▓");

            if (method.modifiers && method.modifiers.length > 0) {
                const activeModifiers = method.modifiers.filter(m => m.active);
                if (activeModifiers.length > 0) {
                    const modLine = `║ ⚡ ${activeModifiers.length} modifier(s)`;
                    cardLines.push(modLine + " ".repeat(width - modLine.length - 1) + "║");
                }
            }

            cardLines.push("╚" + "═".repeat(width - 2) + "╝█");

            const testResult = lines.concat(cardLines).join("\n");
            if (testResult.length + 20 > MAX_LENGTH && i > 0) {
                const moreText = `+${pricingMethods.length - i} more`;
                lines.push("║ " + moreText + " ".repeat(width - 3 - moreText.length) + "║");
                break;
            }

            lines.push(...cardLines);
            currentLength = lines.join("\n").length;
        }

        lines.push("```");
        const result = lines.join("\n");

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

    private static buildEnhancedPricingTable(
        pricingMethods: PricingMethod[]
    ): string {
        
        return this.buildUnicode3DPricingTable(pricingMethods, false);
    }

    static buildServiceActionButtons(
        serviceId: string,
        categoryId: string,
        paginationOptions?: PaginationOptions
    ): ActionRowBuilder<ButtonBuilder>[] {
        
        if (paginationOptions) {
            return createServiceActionButtonsWithPagination(
                serviceId,
                categoryId,
                paginationOptions
            );
        }

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

    static buildAdminRefreshButton(): ActionRowBuilder<ButtonBuilder> {
        return new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId("admin_refresh_pricing_channel")
                .setLabel("🔄 Refresh Pricing Channel")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🔄")
        );
    }

    private static formatPrice(price: any, currency: string = "USD"): string {
        const num = toNumber(price);

        if (num === 0 && price !== 0 && price !== '0') {
            return "Contact Us";
        }

        const formatter = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

        if (num >= 1000000) {
            const millions = num / 1000000;
            return formatter.format(millions).replace(/\.00$/, "") + "M";
        } else if (num >= 1000) {
            const thousands = num / 1000;
            return formatter.format(thousands).replace(/\.00$/, "") + "K";
        } else if (num < 1 && num > 0) {
            
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

    private static formatPriceNumber(price: any): string {
        const num = toNumber(price);

        if (num === 0 && price !== 0 && price !== '0') {
            return "Contact Us";
        }

        return formatPriceUtil(num);
    }

    private static padString(str: string, length: number): string {
        const safeLength = Math.max(0, length);
        if (!str || str.length >= safeLength) {
            return str ? str.substring(0, safeLength) : "";
        }
        return str + " ".repeat(safeLength - str.length);
    }

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

    static buildMMOGoldHutStylePricing(pricingMethods: PricingMethod[]): string {
        if (!pricingMethods || pricingMethods.length === 0) {
            return "```\n💬 Contact us for custom pricing\n```";
        }

        const MAX_LENGTH = 950; 
        const lines: string[] = [];
        const width = 50; 

        lines.push("```ansi");

        lines.push(this.ANSI.BRIGHT_CYAN + "╔" + "═".repeat(width - 2) + "╗" + this.ANSI.RESET);
        lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + this.centerText(this.ANSI.BRIGHT_YELLOW + "💰 PRICING" + this.ANSI.RESET, width - 2) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
        lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);

        const groupedMethods = this.groupPricingMethodsByType(pricingMethods);
        let methodCount = 0;
        let totalMethods = pricingMethods.length;
        let truncated = false;

        for (const [groupName, methods] of Object.entries(groupedMethods)) {
            
            const estimatedLength = lines.join("\n").length + (groupName.length * 2) + (methods.length * 60);
            if (estimatedLength > MAX_LENGTH && methodCount > 0) {
                truncated = true;
                break;
            }

            const truncatedGroupName = groupName.length > 40 ? groupName.substring(0, 37) + "..." : groupName;
            const headerPadding = Math.max(0, width - 5 - truncatedGroupName.length);
            lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + this.ANSI.BRIGHT_WHITE + truncatedGroupName + this.ANSI.RESET + " ".repeat(headerPadding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);

            for (const method of methods) {
                
                if (lines.join("\n").length > MAX_LENGTH && methodCount > 0) {
                    truncated = true;
                    break;
                }

                const priceLine = this.formatPricingMethodLineANSI(method);
                
                const strippedLine = priceLine.replace(/\u001b\[[\d;]+m/g, "");
                const padding = Math.max(0, width - 4 - strippedLine.length);
                lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + priceLine + " ".repeat(padding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
                methodCount++;
            }

            if (truncated) break;
        }

        if (truncated) {
            const remaining = totalMethods - methodCount;
            const msg = `+${remaining} more`;
            const msgPadding = Math.max(0, width - 4 - msg.length);
            lines.push(this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET + " " + msg + " ".repeat(msgPadding) + this.ANSI.BRIGHT_CYAN + "║" + this.ANSI.RESET);
        }

        const upcharges = this.extractUpcharges(pricingMethods);
        if (upcharges.length > 0 && lines.join("\n").length < MAX_LENGTH - 200) {
            lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);
            const maxUpcharges = Math.min(3, upcharges.length);

            for (let i = 0; i < maxUpcharges; i++) {
                const upcharge = upcharges[i];
                
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

        const notes = this.extractNotes(pricingMethods);
        if (notes.length > 0 && lines.join("\n").length < MAX_LENGTH - 150) {
            lines.push(this.ANSI.BRIGHT_CYAN + "╠" + "═".repeat(width - 2) + "╣" + this.ANSI.RESET);
            const maxNotes = Math.min(2, notes.length);

            for (let i = 0; i < maxNotes; i++) {
                const note = notes[i];
                
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

        lines.push(this.ANSI.BRIGHT_CYAN + "╚" + "═".repeat(width - 2) + "╝" + this.ANSI.RESET);
        lines.push("```");

        const result = lines.join("\n");

        if (result.length > 1024) {
            logger.warn(`[PricingBuilder] Table too long (${result.length} chars), using simple format`);
            return this.buildSimplePricingFallback(pricingMethods);
        }

        logger.debug(`[PricingBuilder] Table size: ${result.length} chars (${methodCount} methods shown)`);
        return result;
    }

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

    private static formatPricingMethodLineANSI(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            return `${this.ANSI.BRIGHT_CYAN}${method.startLevel}-${method.endLevel}${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            return `${this.ANSI.BRIGHT_CYAN}${method.startLevel}+${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        } else {
            
            const name = method.name.substring(0, 30);
            return `${this.ANSI.BRIGHT_WHITE}${name}${this.ANSI.RESET} = ${this.ANSI.BRIGHT_YELLOW}$${price}${this.ANSI.RESET} ${unit}`;
        }
    }

    private static formatPricingMethodLineClean(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            return `${method.startLevel}-${method.endLevel} = $${price} ${unit}`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            return `${method.startLevel}+ = $${price} ${unit}`;
        } else {
            
            const name = method.name.substring(0, 30);
            return `${name} = $${price} ${unit}`;
        }
    }

    private static formatPricingMethodLine(method: PricingMethod): string {
        const price = this.formatPrice(method.basePrice);
        const unit = this.formatPricingUnit(method.pricingUnit);

        if (method.startLevel !== null && method.startLevel !== undefined &&
            method.endLevel !== null && method.endLevel !== undefined) {
            const levelRange = `[1;96m${method.startLevel} - ${method.endLevel}[0m`;
            return `${levelRange} = [1;93m${price}[0m [0;37m${unit}[0m`;
        } else if (method.startLevel !== null && method.startLevel !== undefined) {
            const levelRange = `[1;96m${method.startLevel}+[0m`;
            return `${levelRange} = [1;93m${price}[0m [0;37m${unit}[0m`;
        } else {
            
            const name = method.name.substring(0, 30);
            return `[1;96m${name}[0m = [1;93m${price}[0m [0;37m${unit}[0m`;
        }
    }

    private static groupPricingMethodsByType(methods: PricingMethod[]): Record<string, PricingMethod[]> {
        
        const withGroup: PricingMethod[] = [];
        const withoutGroup: PricingMethod[] = [];

        for (const method of methods) {
            if (method.groupName && method.groupName.trim()) {
                withGroup.push(method);
            } else {
                withoutGroup.push(method);
            }
        }

        const groupMap: Map<string, PricingMethod[]> = new Map();
        const groupMinOrder: Map<string, number> = new Map(); 

        for (const method of withGroup) {
            const groupName = method.groupName!.trim();
            const order = method.displayOrder ?? 999;

            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, []);
                groupMinOrder.set(groupName, order);
            } else {
                
                const currentMin = groupMinOrder.get(groupName)!;
                if (order < currentMin) {
                    groupMinOrder.set(groupName, order);
                }
            }

            groupMap.get(groupName)!.push(method);
        }

        for (const [groupName, groupMethods] of groupMap) {
            groupMethods.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));
        }

        withoutGroup.sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

        type Entry =
            | { type: 'group'; name: string; methods: PricingMethod[]; minOrder: number }
            | { type: 'individual'; method: PricingMethod; order: number };

        const entries: Entry[] = [];

        for (const [groupName, groupMethods] of groupMap) {
            entries.push({
                type: 'group',
                name: groupName,
                methods: groupMethods,
                minOrder: groupMinOrder.get(groupName)!
            });
        }

        for (const method of withoutGroup) {
            entries.push({
                type: 'individual',
                method,
                order: method.displayOrder ?? 999
            });
        }

        entries.sort((a, b) => {
            const orderA = a.type === 'group' ? a.minOrder : a.order;
            const orderB = b.type === 'group' ? b.minOrder : b.order;
            return orderA - orderB;
        });

        const result: Record<string, PricingMethod[]> = {};

        for (const entry of entries) {
            const key = entry.type === 'group' ? entry.name : entry.method.name;
            const methodsToAdd = entry.type === 'group' ? entry.methods : [entry.method];

            if (result[key]) {
                result[key].push(...methodsToAdd);
            } else {
                result[key] = [...methodsToAdd];
            }
        }

        return result;
    }

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

    private static formatModifierValue(modifier: PricingModifier): string {
        if (modifier.modifierType === 'PERCENTAGE') {
            return `+${modifier.value}%`;
        } else {
            return `+${this.formatPrice(modifier.value)}`;
        }
    }

    private static centerText(text: string, width: number): string {
        
        const cleanText = text.replace(/\u001b\[[\d;]+m/g, "").replace(/\[[\d;]+m/g, "");
        const padding = Math.max(0, Math.floor((width - cleanText.length) / 2));
        const rightPadding = Math.max(0, width - cleanText.length - padding);
        return " ".repeat(padding) + text + " ".repeat(rightPadding);
    }
}
