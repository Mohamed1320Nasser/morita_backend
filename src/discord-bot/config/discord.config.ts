import { config } from "dotenv";
import logger from "../../common/loggers";

config();

export const discordConfig = {
    
    token: process.env.DISCORD_BOT_TOKEN || "",
    clientId: process.env.DISCORD_CLIENT_ID || "",
    guildId: process.env.DISCORD_GUILD_ID || "",

    workersRoleId: process.env.DISCORD_WORKERS_ROLE_ID || "",
    adminRoleId: process.env.DISCORD_ADMIN_ROLE_ID || "",
    supportRoleId: process.env.DISCORD_SUPPORT_ROLE_ID || "",

    ordersCategoryId: process.env.DISCORD_ORDERS_CATEGORY_ID || "",
    logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID || "",
    announcementsChannelId:
        process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID || "1432045148795310233",
    pricingChannelId: process.env.DISCORD_PRICING_CHANNEL_ID || "",
    calculatorChannelId: process.env.DISCORD_CALCULATOR_CHANNEL_ID || "", 
    jobClaimingChannelId: process.env.DISCORD_JOB_CLAIMING_CHANNEL_ID || "", 
    completedOrdersChannelId: process.env.DISCORD_COMPLETED_ORDERS_CHANNEL_ID || "", 
    reviewsChannelId: process.env.DISCORD_REVIEWS_CHANNEL_ID || "", 
    issuesChannelId: process.env.DISCORD_ISSUES_CHANNEL_ID || "", 

    prefix: process.env.BOT_PREFIX || "!",
    embedColor: process.env.EMBED_COLOR || "#FFD700",
    brandLogoUrl:
        process.env.BRAND_LOGO_URL ||
        "https://via.placeholder.com/64x64/FFD700/000000?text=🎮",

    apiBaseUrl: process.env.API_BASE_URL || "http://localhost:3000",
    apiAuthToken: process.env.API_AUTH_TOKEN || "",

    intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],

    commandCooldown: 3000, 
    maxCommandUses: 5, 

    ticketChannelPrefix: "ticket-",
    ticketAutoClose: 24 * 60 * 60 * 1000, 
    ticketCategoryId: process.env.DISCORD_TICKETS_CATEGORY_ID || "", 
    closedTicketsCategoryId: process.env.DISCORD_CLOSED_TICKETS_CATEGORY_ID || "", 
    ticketLogChannelId: process.env.DISCORD_TICKET_LOG_CHANNEL_ID || "", 
    closedTicketArchiveAfter: parseInt(process.env.CLOSED_TICKET_ARCHIVE_AFTER_HOURS || "72") * 60 * 60 * 1000, 

    createTicketCategoryId: process.env.DISCORD_CREATE_TICKET_CATEGORY_ID || "",
    purchaseServicesChannelId: process.env.DISCORD_PURCHASE_SERVICES_CHANNEL_ID || "",
    purchaseGoldChannelId: process.env.DISCORD_PURCHASE_GOLD_CHANNEL_ID || "",
    sellGoldChannelId: process.env.DISCORD_SELL_GOLD_CHANNEL_ID || "",
    swapCryptoChannelId: process.env.DISCORD_SWAP_CRYPTO_CHANNEL_ID || "",
    accountShopChannelId: process.env.DISCORD_ACCOUNT_SHOP_CHANNEL_ID || "", 

    serviceDetailExpiry:
        parseInt(process.env.SERVICE_DETAIL_EXPIRY_MS || "300000") || 300000, 
    pricingSyncInterval:
        parseInt(process.env.PRICING_SYNC_INTERVAL_MS || "300000") || 300000, 

    logLevel: process.env.LOG_LEVEL || "info",

    // Mention Reminder Settings
    mentionChannelReminderDelayMinutes: parseInt(process.env.MENTION_CHANNEL_REMINDER_DELAY_MINUTES || "10") || 10,
    mentionDmReminderDelayMinutes: parseInt(process.env.MENTION_DM_REMINDER_DELAY_MINUTES || "30") || 30,
    mentionCheckIntervalMinutes: parseInt(process.env.MENTION_CHECK_INTERVAL_MINUTES || "5") || 5,
    mentionTrackAllChannels: process.env.MENTION_TRACK_ALL_CHANNELS === "true",

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
