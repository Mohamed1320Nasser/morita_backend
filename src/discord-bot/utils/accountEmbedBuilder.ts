import {
    EmbedBuilder,
    ColorResolvable,
} from "discord.js";
import { COLORS } from "../constants/colors";
import { EMOJIS } from "../constants/emojis";

// Account types for type safety
export interface AccountCategory {
    category: string;
    availableCount: number;
    label: string;
    emoji: string;
}

export interface AccountStats {
    combatLevel?: number;
    totalLevel?: number;
    attack?: number;
    strength?: number;
    defence?: number;
    ranged?: number;
    magic?: number;
    prayer?: number;
    hitpoints?: number;
}

export interface AccountFeature {
    name: string;
    available: boolean;
}

export interface AccountThumbnail {
    id: string;
    url?: string;
    file?: {
        url?: string;
    };
}

export interface AccountListItem {
    id: string;
    name: string;
    price: number;
    category: string;
    accountData: any;
    thumbnail: AccountThumbnail | null;
    stats: AccountStats;
}

export interface AccountDetail extends AccountListItem {
    images: AccountThumbnail[];
    features: AccountFeature[];
    source?: string;
    quantity?: number;
}

// Color mapping for account categories
const ACCOUNT_COLORS: Record<string, number> = {
    MAIN: 0x3498db,      // Blue
    IRONS: 0x7f8c8d,     // Gray
    HCIM: 0xe74c3c,      // Red
    ZERK: 0x9b59b6,      // Purple
    PURE: 0x2ecc71,      // Green
    ACCOUNTS: 0xf39c12,  // Orange
};

// Emoji mapping for account categories
const ACCOUNT_EMOJIS: Record<string, string> = {
    MAIN: '⚔️',
    IRONS: '🔨',
    HCIM: '💀',
    ZERK: '🗡️',
    PURE: '🏹',
    ACCOUNTS: '📦',
};

export class AccountEmbedBuilder {
    /**
     * Create the main account shop embed
     */
    static createAccountShopEmbed(): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`${EMOJIS.BRAND || '🎮'} OSRS Accounts For Sale`)
            .setDescription(
                "**Browse our verified account inventory**\n\n" +
                "✅ Instant delivery after payment\n" +
                "✅ Full credentials provided\n" +
                "✅ Original owner accounts\n" +
                "✅ 24/7 Support\n\n" +
                "Click the button below to browse available accounts."
            )
            .setColor(0xc9a961 as ColorResolvable)
            .setThumbnail(
                process.env.BRAND_LOGO_URL ||
                "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮"
            )
            .setAuthor({
                name: "MORITA Gaming",
                iconURL: process.env.BRAND_LOGO_URL || undefined,
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Premium Account Store",
                iconURL: process.env.BRAND_LOGO_URL || undefined,
            });
    }

    /**
     * Create category selection embed showing available categories with counts
     */
    static createCategorySelectionEmbed(categories: AccountCategory[]): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.BRAND || '🎮'} Select Account Type`)
            .setDescription("Choose a category to browse available accounts:")
            .setColor(0xc9a961 as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Select a category",
            });

        // Add category fields
        const categoryText = categories.map(cat => {
            const countText = cat.availableCount > 0
                ? `\`${cat.availableCount} available\``
                : `\`Out of stock\``;
            return `${cat.emoji} **${cat.label}** - ${countText}`;
        }).join('\n');

        embed.addFields({
            name: "Available Categories",
            value: categoryText || "No categories available",
            inline: false,
        });

        return embed;
    }

    /**
     * Create account list embed for a specific category
     */
    static createAccountListEmbed(
        category: string,
        accounts: AccountListItem[],
        page: number,
        totalPages: number,
        total: number
    ): EmbedBuilder {
        const categoryEmoji = ACCOUNT_EMOJIS[category] || '📦';
        const categoryColor = ACCOUNT_COLORS[category] || 0xc9a961;
        const categoryLabel = this.getCategoryLabel(category);

        const embed = new EmbedBuilder()
            .setTitle(`${categoryEmoji} ${categoryLabel}`)
            .setDescription(`**${total} account${total !== 1 ? 's' : ''} available**\n\nSelect an account to view details:`)
            .setColor(categoryColor as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: `Page ${page}/${totalPages} • MORITA Gaming`,
            });

        if (accounts.length === 0) {
            embed.addFields({
                name: "No Accounts Available",
                value: "There are currently no accounts in stock for this category.\nPlease check back later or browse other categories.",
                inline: false,
            });
            return embed;
        }

        // Add each account as a field
        accounts.forEach((account, index) => {
            const stats = this.formatStatsCompact(account.stats);
            const priceFormatted = `$${account.price.toFixed(2)}`;

            embed.addFields({
                name: `${index + 1}. ${account.name}`,
                value: `💰 **${priceFormatted}**${stats ? `\n📊 ${stats}` : ''}`,
                inline: true,
            });
        });

        return embed;
    }

    /**
     * Create detailed account view embed (main info embed)
     */
    static createAccountDetailEmbed(account: AccountDetail): EmbedBuilder {
        const categoryEmoji = ACCOUNT_EMOJIS[account.category] || '📦';
        const categoryColor = ACCOUNT_COLORS[account.category] || 0xc9a961;

        const embed = new EmbedBuilder()
            .setTitle(`${categoryEmoji} ${account.name}`)
            .setDescription(this.getCategoryLabel(account.category))
            .setColor(categoryColor as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Account Details",
            });

        // Price field (prominent)
        embed.addFields({
            name: "💰 Price",
            value: `**$${account.price.toFixed(2)}**`,
            inline: true,
        });

        // Category field
        embed.addFields({
            name: "📁 Category",
            value: this.getCategoryLabel(account.category),
            inline: true,
        });

        // Quantity if available
        if (account.quantity && account.quantity > 1) {
            embed.addFields({
                name: "📦 Quantity",
                value: `${account.quantity} available`,
                inline: true,
            });
        }

        // Stats section
        const statsText = this.formatStatsDetailed(account.stats);
        if (statsText) {
            embed.addFields({
                name: "📊 Account Stats",
                value: statsText,
                inline: false,
            });
        }

        // Features section
        if (account.features && account.features.length > 0) {
            const featuresText = account.features.map(f => {
                const icon = f.available ? '✅' : '❌';
                return `${icon} ${f.name}`;
            }).join('\n');

            embed.addFields({
                name: "🎯 Features & Unlocks",
                value: featuresText,
                inline: false,
            });
        }

        // Source info if available
        if (account.source) {
            embed.addFields({
                name: "📝 Notes",
                value: account.source,
                inline: false,
            });
        }

        return embed;
    }

    /**
     * Create multiple embeds for account details with all images
     * Returns array of embeds: main info embed + image embeds (up to 10 total)
     */
    static createAccountDetailEmbeds(account: AccountDetail): EmbedBuilder[] {
        const embeds: EmbedBuilder[] = [];
        const categoryColor = ACCOUNT_COLORS[account.category] || 0xc9a961;

        // First embed: main account info
        const mainEmbed = this.createAccountDetailEmbed(account);
        embeds.push(mainEmbed);

        // Add image embeds (Discord allows up to 10 embeds per message)
        if (account.images && account.images.length > 0) {
            // Limit to 9 more embeds (1 main + 9 images = 10 max)
            const maxImages = Math.min(account.images.length, 9);

            for (let i = 0; i < maxImages; i++) {
                const img = account.images[i];
                const imageUrl = img?.url || img?.file?.url;

                if (imageUrl) {
                    const imageEmbed = new EmbedBuilder()
                        .setColor(categoryColor as ColorResolvable)
                        .setImage(imageUrl);

                    // Only add footer to last image embed
                    if (i === maxImages - 1) {
                        imageEmbed.setFooter({
                            text: `📸 Image ${i + 1} of ${account.images.length}`,
                        });
                    }

                    embeds.push(imageEmbed);
                }
            }
        } else if (account.thumbnail?.url || account.thumbnail?.file?.url) {
            // Fallback to thumbnail if no images array
            const thumbUrl = account.thumbnail?.url || account.thumbnail?.file?.url;
            if (thumbUrl) {
                const thumbEmbed = new EmbedBuilder()
                    .setColor(categoryColor as ColorResolvable)
                    .setImage(thumbUrl);
                embeds.push(thumbEmbed);
            }
        }

        return embeds;
    }

    /**
     * Create purchase confirmation embed
     */
    static createPurchaseConfirmEmbed(account: AccountDetail, paymentMethod?: string): EmbedBuilder {
        const categoryEmoji = ACCOUNT_EMOJIS[account.category] || '📦';

        return new EmbedBuilder()
            .setTitle(`${categoryEmoji} Confirm Purchase`)
            .setDescription(
                "Please review your purchase details before confirming:\n\n" +
                "⚠️ **By confirming, the account will be reserved for you.**"
            )
            .setColor(0xf1c40f as ColorResolvable) // Warning yellow
            .addFields(
                {
                    name: "📦 Account",
                    value: account.name,
                    inline: true,
                },
                {
                    name: "💰 Price",
                    value: `**$${account.price.toFixed(2)}**`,
                    inline: true,
                },
                {
                    name: "💳 Payment",
                    value: paymentMethod || "To be selected",
                    inline: true,
                }
            )
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Confirm your purchase",
            });
    }

    /**
     * Create ticket welcome embed for account purchase
     */
    static createAccountTicketEmbed(
        account: AccountDetail,
        ticketNumber: number,
        customerMention: string,
        paymentMethod?: string
    ): EmbedBuilder {
        const categoryEmoji = ACCOUNT_EMOJIS[account.category] || '📦';

        return new EmbedBuilder()
            .setTitle(`🎫 Account Purchase - #${ticketNumber}`)
            .setDescription(
                `Welcome ${customerMention}!\n\n` +
                "Thank you for your purchase. Please follow the instructions below."
            )
            .setColor(0x3498db as ColorResolvable)
            .addFields(
                {
                    name: `${categoryEmoji} Account`,
                    value: account.name,
                    inline: true,
                },
                {
                    name: "💰 Price",
                    value: `**$${account.price.toFixed(2)}**`,
                    inline: true,
                },
                {
                    name: "💳 Payment Method",
                    value: paymentMethod || "Pending selection",
                    inline: true,
                },
                {
                    name: "📋 Status",
                    value: "⏳ Awaiting Payment",
                    inline: true,
                }
            )
            .addFields({
                name: "📝 Next Steps",
                value:
                    "1️⃣ Confirm your payment method\n" +
                    "2️⃣ Send payment to the provided address/details\n" +
                    "3️⃣ Click 'Payment Sent' once complete\n" +
                    "4️⃣ Receive your account credentials",
                inline: false,
            })
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Account Purchase",
            });
    }

    /**
     * Create account delivery embed (shown after payment confirmed)
     */
    static createAccountDeliveryEmbed(
        account: AccountDetail,
        credentials: {
            email?: string;
            password?: string;
            bankPin?: string;
            additionalInfo?: string;
        }
    ): EmbedBuilder {
        const embed = new EmbedBuilder()
            .setTitle("✅ Account Delivered!")
            .setDescription(
                "Your account has been delivered successfully.\n\n" +
                "**⚠️ IMPORTANT SECURITY STEPS:**"
            )
            .setColor(0x2ecc71 as ColorResolvable) // Success green
            .addFields({
                name: "🔐 Login Credentials",
                value:
                    "```\n" +
                    `Email/Username: ${credentials.email || 'See below'}\n` +
                    `Password: ${credentials.password || 'See below'}\n` +
                    (credentials.bankPin ? `Bank PIN: ${credentials.bankPin}\n` : '') +
                    "```",
                inline: false,
            })
            .addFields({
                name: "🛡️ Security Checklist",
                value:
                    "1. Change password immediately\n" +
                    "2. Set up Authenticator (2FA)\n" +
                    "3. Change registered email\n" +
                    "4. Change bank PIN\n" +
                    "5. Review account settings",
                inline: false,
            });

        if (credentials.additionalInfo) {
            embed.addFields({
                name: "📝 Additional Information",
                value: credentials.additionalInfo,
                inline: false,
            });
        }

        embed.setTimestamp()
            .setFooter({
                text: "MORITA Gaming • Thank you for your purchase!",
            });

        return embed;
    }

    /**
     * Create out of stock embed
     */
    static createOutOfStockEmbed(category?: string): EmbedBuilder {
        const title = category
            ? `${ACCOUNT_EMOJIS[category] || '📦'} ${this.getCategoryLabel(category)}`
            : "Account Shop";

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(
                "**Currently Out of Stock**\n\n" +
                "We're sorry, but there are no accounts available at this time.\n\n" +
                "Please check back later or contact support for more information."
            )
            .setColor(0xe74c3c as ColorResolvable) // Red
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming",
            });
    }

    /**
     * Create error embed for account operations
     */
    static createErrorEmbed(title: string, message: string): EmbedBuilder {
        return new EmbedBuilder()
            .setTitle(`❌ ${title}`)
            .setDescription(message)
            .setColor(0xe74c3c as ColorResolvable)
            .setTimestamp()
            .setFooter({
                text: "MORITA Gaming",
            });
    }

    // ==================== Helper Methods ====================

    private static getCategoryLabel(category: string): string {
        const labels: Record<string, string> = {
            MAIN: 'Main Accounts',
            IRONS: 'Ironman Accounts',
            HCIM: 'HCIM Accounts',
            ZERK: 'Zerker Accounts',
            PURE: 'Pure Accounts',
            ACCOUNTS: 'Other Accounts',
        };
        return labels[category] || category;
    }

    private static formatStatsCompact(stats: AccountStats): string {
        if (!stats || Object.keys(stats).length === 0) return '';

        const parts: string[] = [];

        if (stats.combatLevel) parts.push(`⚔️ CB ${stats.combatLevel}`);
        if (stats.totalLevel) parts.push(`📊 Total ${stats.totalLevel}`);

        // Add key combat stats if available
        const combatParts: string[] = [];
        if (stats.attack) combatParts.push(`${stats.attack}`);
        if (stats.strength) combatParts.push(`${stats.strength}`);
        if (stats.defence) combatParts.push(`${stats.defence}`);

        if (combatParts.length === 3) {
            parts.push(`ATK/STR/DEF: ${combatParts.join('/')}`);
        }

        return parts.join(' | ');
    }

    private static formatStatsDetailed(stats: AccountStats): string {
        if (!stats || Object.keys(stats).length === 0) return '';

        const lines: string[] = [];

        if (stats.combatLevel) lines.push(`**Combat Level:** ${stats.combatLevel}`);
        if (stats.totalLevel) lines.push(`**Total Level:** ${stats.totalLevel}`);

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
            lines.push(`**Stats:** ${combatStats.join(' | ')}`);
        }

        return lines.join('\n');
    }
}
