import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

/**
 * Build the account shop message for Discord
 * This is the main entry point for users to browse and purchase accounts
 */
export async function buildAccountShopMessage() {
    let welcomeTitle = "🎮 OSRS Accounts For Sale";
    let welcomeMessage = "";
    let bannerUrl = "";
    let thumbnailUrl = "";
    let embedColor = 0xc9a961;
    let footerText = "MORITA Gaming • Premium Account Store";

    // Try to fetch settings from API
    try {
        const response: any = await discordApiClient.get(
            `/ticket-type-settings/PURCHASE_ACCOUNT`
        );

        if (response && response.data) {
            const settings = response.data;
            welcomeTitle = settings.welcomeTitle || welcomeTitle;
            welcomeMessage = settings.welcomeMessage || "";
            bannerUrl = settings.bannerUrl || "";
            thumbnailUrl = settings.thumbnailUrl || "";
            embedColor = settings.embedColor ? parseInt(settings.embedColor, 16) : embedColor;
            footerText = settings.footerText || footerText;
        }
    } catch (error) {
        logger.warn("Error fetching ticket type settings for account shop, using defaults:", error);
    }

    // Fetch account stats
    let statsText = "";
    try {
        const statsResponse: any = await discordApiClient.get(`/accounts/stats`);
        if (statsResponse && statsResponse.data) {
            const { inStockAccounts, totalValue } = statsResponse.data;
            statsText = `\n\n📦 **${inStockAccounts || 0}** accounts in stock`;
        }
    } catch (error) {
        logger.warn("Error fetching account stats:", error);
    }

    // Default message if none configured
    if (!welcomeMessage) {
        welcomeMessage = `**Browse our verified account inventory**

✅ **Instant Delivery** - Receive credentials immediately after payment
✅ **Full Credentials** - Email, password, and bank PIN provided
✅ **Verified Accounts** - All accounts thoroughly vetted
✅ **24/7 Support** - Assistance with login and security setup

**Account Types Available:**
⚔️ Main Accounts • 🔨 Ironman • 💀 HCIM
🗡️ Zerkers • 🏹 Pures • 📦 Other Builds${statsText}

Click the button below to browse available accounts.`;
    }

    const embed = new EmbedBuilder()
        .setTitle(welcomeTitle)
        .setColor(embedColor)
        .setDescription(welcomeMessage)
        .setFooter({
            text: footerText,
            iconURL: process.env.BRAND_LOGO_URL || undefined,
        })
        .setTimestamp();

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    } else if (process.env.BRAND_LOGO_URL) {
        embed.setThumbnail(process.env.BRAND_LOGO_URL);
    }

    if (bannerUrl) {
        embed.setImage(bannerUrl);
    }

    // Create the browse accounts button
    const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("browse_accounts")
            .setLabel("🛒 Browse Accounts")
            .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [buttonRow] };
}

/**
 * Build a simple account shop embed for testing
 */
export function buildSimpleAccountShopEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🎮 OSRS Accounts For Sale")
        .setColor(0xc9a961)
        .setDescription(
            "**Browse our verified account inventory**\n\n" +
            "✅ Instant delivery after payment\n" +
            "✅ Full credentials provided\n" +
            "✅ Original owner accounts\n" +
            "✅ 24/7 Support\n\n" +
            "Click the button below to browse available accounts."
        )
        .setFooter({
            text: "MORITA Gaming • Premium Account Store",
        })
        .setTimestamp();
}
