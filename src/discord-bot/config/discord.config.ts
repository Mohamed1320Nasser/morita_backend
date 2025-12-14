import { config } from "dotenv";
import logger from "../../common/loggers";

config();

export const discordConfig = {
    // Bot credentials
    token: process.env.DISCORD_BOT_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "1431962373719326781",
    guildId: process.env.DISCORD_GUILD_ID || "1431960124699709482",

    // Role IDs
    workersRoleId: process.env.DISCORD_WORKERS_ROLE_ID || "1432045978134905055",
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID || "1432046286625964204",
    supportRoleId: process.env.DISCORD_SUPPORT_ROLE_ID || "1432046601266004168",

    // Channel IDs
    ordersCategoryId: process.env.DISCORD_ORDERS_CATEGORY_ID || "",
    logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID || "",
    announcementsChannelId:
        process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || "1432045148795310233",
    pricingChannelId: process.env.DISCORD_PRICING_CHANNEL_ID || "",
    calculatorChannelId: process.env.DISCORD_CALCULATOR_CHANNEL_ID || "", // Price calculator (!s command)
    jobClaimingChannelId: process.env.DISCORD_JOB_CLAIMING_CHANNEL_ID || "", // Channel where unclaimed jobs are posted

    // Bot settings
    prefix: process.env.BOT_PREFIX || "!",
    embedColor: process.env.EMBED_COLOR || "#FFD700",
    brandLogoUrl:
        process.env.BRAND_LOGO_URL ||
        "https://via.placeholder.com/64x64/FFD700/000000?text=🎮",

    // API settings
    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
    apiAuthToken: process.env.API_AUTH_TOKEN || "",

    // Bot intents
    intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],

    // Command settings
    commandCooldown: 3000, // 3 seconds
    maxCommandUses: 5, // per user per minute

    // Ticket settings
    ticketChannelPrefix: "ticket-",
    ticketAutoClose: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    ticketCategoryId: process.env.DISCORD_TICKETS_CATEGORY_ID || "", // Parent category for ticket channels
    ticketLogChannelId: process.env.DISCORD_TICKET_LOG_CHANNEL_ID || "", // Log channel for ticket events

    // CREATE TICKET category and channels (NEW)
    createTicketCategoryId: process.env.DISCORD_CREATE_TICKET_CATEGORY_ID || "", // CREATE TICKET category
    purchaseServicesChannelId: process.env.DISCORD_PURCHASE_SERVICES_CHANNEL_ID || "", // purchase-services channel
    purchaseGoldChannelId: process.env.DISCORD_PURCHASE_GOLD_CHANNEL_ID || "", // purchase-gold channel
    sellGoldChannelId: process.env.DISCORD_SELL_GOLD_CHANNEL_ID || "", // sell-gold channel
    swapCryptoChannelId: process.env.DISCORD_SWAP_CRYPTO_CHANNEL_ID || "", // swap-crypto channel

    // Pricing channel settings
    serviceDetailExpiry:
        parseInt(process.env.SERVICE_DETAIL_EXPIRY_MS || "300000") || 300000, // 5 minutes
    pricingSyncInterval:
        parseInt(process.env.PRICING_SYNC_INTERVAL_MS || "300000") || 300000, // 5 minutes

    // Logging
    logLevel: process.env.LOG_LEVEL || "info",

    validate(): boolean {
        if (!this.token || !this.clientId || !this.guildId) {
            logger.error(
                `Missing required Discord configuration. Please check your environment variables or config fallbacks.`
            );
            logger.error(`Token: ${this.token ? "Set" : "Missing"}`);
            logger.error(`Client ID: ${this.clientId ? "Set" : "Missing"}`);
            logger.error(`Guild ID: ${this.guildId ? "Set" : "Missing"}`);
            return false;
        }

        return true;
    },
};

if (!discordConfig.validate()) {
    logger.error(
        "Discord bot configuration is invalid. Please check your environment variables."
    );
    process.exit(1);
}
