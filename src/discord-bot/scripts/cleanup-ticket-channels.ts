import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { config } from "dotenv";
import logger from "../../common/loggers";

config();

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

// Get category IDs from .env (with fallbacks to old hardcoded values)
const TICKETS_CATEGORY_ID = process.env.DISCORD_TICKETS_CATEGORY_ID || "1444799020928073908";
const CLOSED_TICKETS_CATEGORY_ID = process.env.DISCORD_CLOSED_TICKETS_CATEGORY_ID || "1451951437998330010";

// Optional: also cleanup these additional categories if specified
const ADDITIONAL_CATEGORY_IDS = process.env.CLEANUP_ADDITIONAL_CATEGORY_IDS?.split(",").filter(Boolean) || []; 

async function cleanupTicketChannels() {
    if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID) {
        logger.error("Missing DISCORD_BOT_TOKEN or DISCORD_GUILD_ID in .env");
        process.exit(1);
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
        ],
    });

    try {
        logger.info("🤖 Logging in to Discord...");
        await client.login(DISCORD_BOT_TOKEN);

        logger.info("✅ Bot logged in successfully");

        const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
        if (!guild) {
            logger.error("❌ Guild not found");
            process.exit(1);
        }

        logger.info(`📋 Guild: ${guild.name}`);

        const channels = await guild.channels.fetch();

        // Build list of all category IDs to clean
        const categoriesToClean = [TICKETS_CATEGORY_ID, CLOSED_TICKETS_CATEGORY_ID, ...ADDITIONAL_CATEGORY_IDS];

        const ticketChannels = channels.filter(
            (channel) =>
                channel &&
                channel.parentId &&
                categoriesToClean.includes(channel.parentId)
        );

        logger.info(`\n📊 Found ${ticketChannels.size} ticket channels to delete:`);
        logger.info(`   - Active Tickets Category: ${TICKETS_CATEGORY_ID}`);
        logger.info(`   - Closed Tickets Category: ${CLOSED_TICKETS_CATEGORY_ID}`);
        if (ADDITIONAL_CATEGORY_IDS.length > 0) {
            logger.info(`   - Additional Categories: ${ADDITIONAL_CATEGORY_IDS.join(", ")}`);
        }
        logger.info("");

        if (ticketChannels.size === 0) {
            logger.info("✅ No channels to delete. Categories are already clean.");
            await client.destroy();
            process.exit(0);
        }

        logger.info("📋 Channels to be deleted:");
        ticketChannels.forEach((channel) => {
            if (channel) {
                let categoryName = "Unknown";
                if (channel.parentId === TICKETS_CATEGORY_ID) {
                    categoryName = "Active Tickets";
                } else if (channel.parentId === CLOSED_TICKETS_CATEGORY_ID) {
                    categoryName = "Closed Tickets";
                } else if (ADDITIONAL_CATEGORY_IDS.includes(channel.parentId || "")) {
                    categoryName = "Additional Category";
                }
                logger.info(`   - ${channel.name} (${categoryName})`);
            }
        });

        logger.warn("\n⚠️  WARNING: This will permanently delete all ticket channels!");
        logger.warn("⚠️  Make sure you have backups if needed!");
        logger.info("\n⏳ Starting deletion in 5 seconds...");
        logger.info("   Press Ctrl+C to cancel\n");

        await new Promise((resolve) => setTimeout(resolve, 5000));

        let deletedCount = 0;
        let errorCount = 0;

        for (const [channelId, channel] of ticketChannels) {
            try {
                if (channel && channel.name) {
                    logger.info(`🗑️  Deleting: ${channel.name}...`);
                    await channel.delete("Cleanup script - removing old ticket channels");
                    deletedCount++;

                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            } catch (error: any) {
                logger.error(`❌ Failed to delete channel: ${error.message}`);
                errorCount++;
            }
        }

        logger.info("\n" + "=".repeat(50));
        logger.info("✅ Cleanup Complete!");
        logger.info("=".repeat(50));
        logger.info(`📊 Total channels found: ${ticketChannels.size}`);
        logger.info(`✅ Successfully deleted: ${deletedCount}`);
        logger.info(`❌ Failed to delete: ${errorCount}`);
        logger.info("=".repeat(50) + "\n");

        await client.destroy();
        logger.info("👋 Bot logged out");
        process.exit(0);
    } catch (error) {
        logger.error("❌ Error during cleanup:", error);
        await client.destroy();
        process.exit(1);
    }
}

logger.info("🧹 Ticket Channels Cleanup Script");
logger.info("=".repeat(50) + "\n");

cleanupTicketChannels().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
});
