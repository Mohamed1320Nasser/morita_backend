import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";
import logger from "../../common/loggers";
import { DISCORD_LIMITS } from "../constants/discord-limits";
import {
    AccountCategory,
    AccountListItem,
    AccountDetail,
} from "./accountEmbedBuilder";

/**
 * Account category with accounts list for channel display
 */
export interface AccountCategoryWithAccounts extends AccountCategory {
    accounts: AccountListItem[];
}

/**
 * Enhanced Account Builder
 * Creates account shop channel display similar to pricing channel
 * Each category = 1 message with dropdown containing its accounts
 */
export class EnhancedAccountBuilder {
    // Emoji mapping for account categories
    private static readonly CATEGORY_EMOJIS: Record<string, string> = {
        MAIN: "⚔️",
        IRONS: "🔨",
        HCIM: "💀",
        ZERK: "🗡️",
        PURE: "🏹",
        ACCOUNTS: "📦",
    };

    // Color mapping for account categories
    private static readonly CATEGORY_COLORS: Record<string, number> = {
        MAIN: 0x3498db, // Blue
        IRONS: 0x7f8c8d, // Gray
        HCIM: 0xe74c3c, // Red
        ZERK: 0x9b59b6, // Purple
        PURE: 0x2ecc71, // Green
        ACCOUNTS: 0xf39c12, // Orange
    };

    // Label mapping for categories
    private static readonly CATEGORY_LABELS: Record<string, string> = {
        MAIN: "Main Accounts",
        IRONS: "Ironman Accounts",
        HCIM: "HCIM Accounts",
        ZERK: "Zerker Accounts",
        PURE: "Pure Accounts",
        ACCOUNTS: "Other Accounts",
    };

    /**
     * Build a category select menu for channel display
     * Creates one message per category with a dropdown of accounts
     */
    static buildCategorySelectMenu(category: AccountCategoryWithAccounts): {
        content: string;
        components: ActionRowBuilder<StringSelectMenuBuilder>[];
        embeds?: EmbedBuilder[];
    } {
        const categoryEmoji =
            this.CATEGORY_EMOJIS[category.category] || category.emoji || "📦";
        const categoryLabel =
            this.CATEGORY_LABELS[category.category] || category.label;

        // Create select menu with accounts as options
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`account_shop_select_${category.category}`)
            .setPlaceholder(
                `${categoryEmoji} ${categoryLabel} - ${category.availableCount} available`
            )
            .setMinValues(1)
            .setMaxValues(1);

        const accounts = category.accounts || [];
        const maxAccounts = Math.min(accounts.length, 25); // Discord limit

        if (maxAccounts === 0) {
            // No accounts available
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("No accounts available")
                    .setDescription("Please check back later")
                    .setValue("none")
                    .setEmoji("❌")
            );
            selectMenu.setDisabled(true);
        } else {
            for (let i = 0; i < maxAccounts; i++) {
                const account = accounts[i];

                // Format account name with price
                const priceText = `$${account.price.toFixed(2)}`;
                const statsText = this.formatAccountStatsShort(account.stats);

                // Create label (max 100 chars)
                let label = account.name;
                if (label.length > 80) {
                    label = label.substring(0, 77) + "...";
                }

                // Create description (max 100 chars)
                let description = priceText;
                if (statsText) {
                    description += ` • ${statsText}`;
                }
                if (description.length > 100) {
                    description = description.substring(0, 97) + "...";
                }

                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(label)
                    .setValue(account.id)
                    .setDescription(description)
                    .setEmoji("🎮");

                selectMenu.addOptions(option);
            }

            // If more than 25 accounts, add a note
            if (accounts.length > 25) {
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`+${accounts.length - 25} more accounts`)
                        .setValue("view_more")
                        .setDescription("Contact support to view all")
                        .setEmoji("📋")
                );
            }
        }

        return {
            content: "", // No content needed, dropdown speaks for itself
            components: [
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    selectMenu
                ),
            ],
        };
    }

    /**
     * Build all category select menus combined in one message
     * Discord allows max 5 action rows per message
     */
    static buildAllCategorySelectMenus(categories: AccountCategoryWithAccounts[]): {
        content: string;
        components: ActionRowBuilder<StringSelectMenuBuilder>[];
        embeds?: EmbedBuilder[];
    } {
        const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];

        // Discord allows max 5 action rows per message
        const maxCategories = Math.min(categories.length, 5);

        for (let i = 0; i < maxCategories; i++) {
            const category = categories[i];
            const categoryEmoji =
                this.CATEGORY_EMOJIS[category.category] || category.emoji || "📦";
            const categoryLabel =
                this.CATEGORY_LABELS[category.category] || category.label;

            // Create select menu with accounts as options
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`account_shop_select_${category.category}`)
                .setPlaceholder(
                    `${categoryEmoji} ${categoryLabel} - ${category.availableCount} available`
                )
                .setMinValues(1)
                .setMaxValues(1);

            const accounts = category.accounts || [];
            const maxAccounts = Math.min(accounts.length, 25); // Discord limit per select

            if (maxAccounts === 0) {
                // No accounts available
                selectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel("No accounts available")
                        .setDescription("Please check back later")
                        .setValue("none")
                        .setEmoji("❌")
                );
                selectMenu.setDisabled(true);
            } else {
                for (let j = 0; j < maxAccounts; j++) {
                    const account = accounts[j];

                    // Format account name with price
                    const priceText = `$${account.price.toFixed(2)}`;
                    const statsText = this.formatAccountStatsShort(account.stats);

                    // Create label (max 100 chars)
                    let label = account.name;
                    if (label.length > 80) {
                        label = label.substring(0, 77) + "...";
                    }

                    // Create description (max 100 chars)
                    let description = priceText;
                    if (statsText) {
                        description += ` • ${statsText}`;
                    }
                    if (description.length > 100) {
                        description = description.substring(0, 97) + "...";
                    }

                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(label)
                        .setValue(account.id)
                        .setDescription(description)
                        .setEmoji("🎮");

                    selectMenu.addOptions(option);
                }

                // If more than 25 accounts, add a note
                if (accounts.length > 25) {
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`+${accounts.length - 25} more accounts`)
                            .setValue("view_more")
                            .setDescription("Contact support to view all")
                            .setEmoji("📋")
                    );
                }
            }

            components.push(
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)
            );
        }

        // If there are more than 5 categories, log a warning
        if (categories.length > 5) {
            logger.warn(
                `[EnhancedAccountBuilder] Only showing first 5 categories out of ${categories.length} (Discord limit)`
            );
        }

        return {
            content: "",
            components,
        };
    }

    /**
     * Build account detail embeds for ephemeral reply
     * Shows full account details with all images - Professional UI
     */
    static buildAccountDetailEmbeds(account: AccountDetail): {
        embeds: EmbedBuilder[];
        components: ActionRowBuilder<ButtonBuilder>[];
    } {
        const embeds: EmbedBuilder[] = [];
        const categoryColor =
            this.CATEGORY_COLORS[account.category] || 0xc9a961;
        const categoryEmoji =
            this.CATEGORY_EMOJIS[account.category] || "📦";
        const categoryLabel =
            this.CATEGORY_LABELS[account.category] || account.category;

        // Get accountData (dynamic JSON from admin)
        const accountData = (account as any).accountData || {};

        // Create professional description
        let description = ``;

        // Price banner
        description += `> 💰 **PRICE: $${account.price.toFixed(2)} USD**\n\n`;

        // Category
        description += `**${categoryEmoji} Category**\n`;
        description += `> ${categoryLabel}\n\n`;

        // Dynamically render ALL fields from accountData
        const allFields = Object.entries(accountData);

        if (allFields.length > 0) {
            for (const [key, value] of allFields) {
                // Format key: camelCase to Title Case (e.g., combatLevel -> Combat Level)
                const formattedKey = key
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();

                // Format value based on type
                if (Array.isArray(value) && value.length > 0) {
                    // Array - show as list with checkmarks
                    description += `**🎯 ${formattedKey}**\n`;
                    description += value.map((item: any) => `✅ ${item}`).join("\n") + `\n\n`;
                } else if (typeof value === 'number') {
                    description += `> **${formattedKey}:** ${value.toLocaleString()}\n`;
                } else if (typeof value === 'boolean') {
                    description += `> **${formattedKey}:** ${value ? '✅ Yes' : '❌ No'}\n`;
                } else if (typeof value === 'string') {
                    // Check if it's a long description-like text
                    if (value.length > 50 || key.toLowerCase().includes('description') || key.toLowerCase().includes('note')) {
                        description += `**📋 ${formattedKey}**\n`;
                        description += `> ${value}\n\n`;
                    } else {
                        description += `> **${formattedKey}:** ${value}\n`;
                    }
                } else if (typeof value === 'object' && value !== null) {
                    // Nested object - show as sub-fields
                    description += `**📊 ${formattedKey}**\n`;
                    for (const [subKey, subValue] of Object.entries(value)) {
                        const formattedSubKey = subKey
                            .replace(/([A-Z])/g, ' $1')
                            .replace(/^./, str => str.toUpperCase())
                            .trim();
                        description += `> **${formattedSubKey}:** ${subValue}\n`;
                    }
                    description += `\n`;
                }
            }
            // Add newline if last item was a simple field
            if (!description.endsWith('\n\n')) {
                description += `\n`;
            }
        }

        // Stock info
        if (account.quantity && account.quantity > 1) {
            description += `**📦 Stock:** ${account.quantity} available\n\n`;
        }

        // Guarantee section
        description += `\`\`\`\n`;
        description += `✅ Instant Delivery\n`;
        description += `✅ Full Credentials Provided\n`;
        description += `✅ 24/7 Support\n`;
        description += `\`\`\``;

        // Main info embed
        const mainEmbed = new EmbedBuilder()
            .setTitle(`${categoryEmoji}  ${account.name}`)
            .setDescription(description)
            .setColor(categoryColor)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Premium Account Store",
                iconURL: process.env.BRAND_LOGO_URL || undefined,
            });

        // Set thumbnail if available (first image as thumbnail)
        if (account.images && account.images.length > 0) {
            const thumbUrl = account.images[0]?.file?.url || account.images[0]?.url;
            if (thumbUrl) {
                mainEmbed.setThumbnail(thumbUrl);
            }
        }

        embeds.push(mainEmbed);

        // Add image embeds (Discord allows up to 10 embeds per message)
        // Skip first image if used as thumbnail, start from index 1
        if (account.images && account.images.length > 1) {
            const maxImages = Math.min(account.images.length - 1, 8); // -1 for thumbnail, max 8 more
            let addedImages = 0;

            for (let i = 1; i < account.images.length && addedImages < maxImages; i++) {
                const img = account.images[i];
                // Try multiple paths to find the URL (API returns file.url after normalization)
                const imageUrl = img?.file?.url || img?.url || (img?.file as any)?.title;

                if (imageUrl) {
                    const imageEmbed = new EmbedBuilder()
                        .setColor(categoryColor)
                        .setImage(imageUrl);

                    // Add footer to last image
                    if (addedImages === maxImages - 1 || i === account.images.length - 1) {
                        imageEmbed.setFooter({
                            text: `📸 Screenshot ${addedImages + 1} of ${account.images.length - 1}`,
                        });
                    }

                    embeds.push(imageEmbed);
                    addedImages++;
                }
            }
        } else if (account.images && account.images.length === 1) {
            // If only one image, show it as main image (not just thumbnail)
            const img = account.images[0];
            const imageUrl = img?.file?.url || img?.url;
            if (imageUrl) {
                mainEmbed.setImage(imageUrl);
            }
        } else if (account.thumbnail?.url || account.thumbnail?.file?.url) {
            // Fallback to thumbnail
            const thumbUrl =
                account.thumbnail?.file?.url || account.thumbnail?.url;
            if (thumbUrl) {
                mainEmbed.setImage(thumbUrl);
            }
        }

        // Create action button - Purchase only
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`account_purchase_${account.id}`)
                .setLabel("Purchase Now")
                .setEmoji("💳")
                .setStyle(ButtonStyle.Success)
        );

        return {
            embeds,
            components: [actionRow],
        };
    }

    /**
     * Build the main account shop header embed
     * This is the first message in the account shop channel
     */
    static buildAccountShopHeaderEmbed(
        totalAccounts: number,
        categoryCount: number
    ): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle("🎮 OSRS Accounts For Sale")
            .setDescription(
                `**Browse our verified account inventory**\n\n` +
                    `✅ **Instant Delivery** - Receive credentials immediately after payment\n` +
                    `✅ **Full Credentials** - Email, password, and bank PIN provided\n` +
                    `✅ **Verified Accounts** - All accounts thoroughly vetted\n` +
                    `✅ **24/7 Support** - Assistance with login and security setup\n\n` +
                    `📦 **${totalAccounts}** accounts available across **${categoryCount}** categories\n\n` +
                    `**Select a category below to browse accounts:**`
            )
            .setColor(0xc9a961)
            .setThumbnail(process.env.BRAND_LOGO_URL || null)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Premium Account Store",
                iconURL: process.env.BRAND_LOGO_URL || undefined,
            });
    }

    /**
     * Build out of stock embed for a category
     */
    static buildOutOfStockEmbed(category?: string): EmbedBuilder {
        const categoryEmoji = category
            ? this.CATEGORY_EMOJIS[category] || "📦"
            : "📦";
        const categoryLabel = category
            ? this.CATEGORY_LABELS[category] || category
            : "Account Shop";

        return new EmbedBuilder()
            .setTitle(`${categoryEmoji} ${categoryLabel}`)
            .setDescription(
                "**Currently Out of Stock**\n\n" +
                    "We're sorry, but there are no accounts available at this time.\n\n" +
                    "Please check back later or contact support for more information."
            )
            .setColor(0xe74c3c)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming",
            });
    }

    /**
     * Build error embed
     */
    static buildErrorEmbed(title: string, message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`❌ ${title}`)
            .setDescription(message)
            .setColor(0xe74c3c)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming",
            });
    }

    // ==================== Helper Methods ====================

    private static formatAccountStatsShort(stats: any): string {
        if (!stats || Object.keys(stats).length === 0) return "";

        const parts: string[] = [];

        if (stats.combatLevel) parts.push(`CB ${stats.combatLevel}`);
        if (stats.totalLevel) parts.push(`Total ${stats.totalLevel}`);

        return parts.join(" • ");
    }

    private static formatAccountStatsDetailed(stats: any): string {
        if (!stats || Object.keys(stats).length === 0) return "";

        const lines: string[] = [];

        if (stats.combatLevel)
            lines.push(`**Combat Level:** ${stats.combatLevel}`);
        if (stats.totalLevel)
            lines.push(`**Total Level:** ${stats.totalLevel}`);

        // Combat stats
        const combatStats: string[] = [];
        if (stats.attack) combatStats.push(`Att: ${stats.attack}`);
        if (stats.strength) combatStats.push(`Str: ${stats.strength}`);
        if (stats.defence) combatStats.push(`Def: ${stats.defence}`);
        if (stats.ranged) combatStats.push(`Rng: ${stats.ranged}`);
        if (stats.magic) combatStats.push(`Mag: ${stats.magic}`);
        if (stats.prayer) combatStats.push(`Pry: ${stats.prayer}`);
        if (stats.hitpoints) combatStats.push(`HP: ${stats.hitpoints}`);

        if (combatStats.length > 0) {
            lines.push(`**Stats:** ${combatStats.join(" | ")}`);
        }

        return lines.join("\n");
    }
}
