import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import { config } from "dotenv";
import logger from "../../common/loggers";

// Load environment variables
config();

/**
 * Script to delete all channels in ticket categories
 * USE WITH CAUTION - This will permanently delete channels!
 */

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID;

// Category IDs to clean up
const TICKETS_CATEGORY_ID = "1444799020928073908"; // Active tickets category
const CLOSED_TICKETS_CATEGORY_ID = "1451951437998330010"; // Closed tickets category

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

        // Get the guild
        const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
        if (!guild) {
            logger.error("❌ Guild not found");
            process.exit(1);
        }

        logger.info(`📋 Guild: ${guild.name}`);

        // Fetch all channels
        const channels = await guild.channels.fetch();

        // Filter channels in both categories
        const ticketChannels = channels.filter(
            (channel) =>
                channel &&
                (channel.parentId === TICKETS_CATEGORY_ID ||
                    channel.parentId === CLOSED_TICKETS_CATEGORY_ID)
        );

        logger.info(`\n📊 Found ${ticketChannels.size} ticket channels to delete:`);
        logger.info(`   - Active Tickets Category: ${TICKETS_CATEGORY_ID}`);
        logger.info(`   - Closed Tickets Category: ${CLOSED_TICKETS_CATEGORY_ID}\n`);

        if (ticketChannels.size === 0) {
            logger.info("✅ No channels to delete. Categories are already clean.");
            await client.destroy();
            process.exit(0);
        }

        // List all channels that will be deleted
        logger.info("📋 Channels to be deleted:");
        ticketChannels.forEach((channel) => {
            if (channel) {
                const categoryName =
                    channel.parentId === TICKETS_CATEGORY_ID
                        ? "Active Tickets"
                        : "Closed Tickets";
                logger.info(`   - ${channel.name} (${categoryName})`);
            }
        });

        // Confirmation prompt (manual - uncomment safety check below)
        logger.warn("\n⚠️  WARNING: This will permanently delete all ticket channels!");
        logger.warn("⚠️  Make sure you have backups if needed!");
        logger.info("\n⏳ Starting deletion in 5 seconds...");
        logger.info("   Press Ctrl+C to cancel\n");

        // Wait 5 seconds for user to cancel
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // Delete all channels
        let deletedCount = 0;
        let errorCount = 0;

        for (const [channelId, channel] of ticketChannels) {
            try {
                if (channel && channel.name) {
                    logger.info(`🗑️  Deleting: ${channel.name}...`);
                    await channel.delete("Cleanup script - removing old ticket channels");
                    deletedCount++;

                    // Add small delay to avoid rate limiting
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            } catch (error: any) {
                logger.error(`❌ Failed to delete channel: ${error.message}`);
                errorCount++;
            }
        }

        // Summary
        logger.info("\n" + "=".repeat(50));
        logger.info("✅ Cleanup Complete!");
        logger.info("=".repeat(50));
        logger.info(`📊 Total channels found: ${ticketChannels.size}`);
        logger.info(`✅ Successfully deleted: ${deletedCount}`);
        logger.info(`❌ Failed to delete: ${errorCount}`);
        logger.info("=".repeat(50) + "\n");

        // Logout
        await client.destroy();
        logger.info("👋 Bot logged out");
        process.exit(0);
    } catch (error) {
        logger.error("❌ Error during cleanup:", error);
        await client.destroy();
        process.exit(1);
    }
}

// Run the cleanup
logger.info("🧹 Ticket Channels Cleanup Script");
logger.info("=".repeat(50) + "\n");

cleanupTicketChannels().catch((error) => {
    logger.error("Fatal error:", error);
    process.exit(1);
});
