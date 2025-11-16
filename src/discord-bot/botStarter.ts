import logger from "../common/loggers";
// Import Environment to ensure .env is loaded (same as backend)
import Environment from "../common/config/environment";
import { discordConfig } from "./config/discord.config";

/**
 * Start Discord bot with proper error handling
 * Bot failures will not crash the backend server
 *
 * This function is called from app.ts after the Express server starts listening
 * Environment variables are already loaded by Environment.ts (same as backend)
 */
export async function startDiscordBot(): Promise<void> {
    try {
        // Check if bot is enabled (default: enabled, set DISCORD_BOT_ENABLED=false to disable)
        const botEnabled = process.env.DISCORD_BOT_ENABLED !== "false";

        if (!botEnabled) {
            logger.info("Discord bot is disabled (DISCORD_BOT_ENABLED=false)");
            return;
        }

        logger.info("Starting Discord bot...");

        // Validate configuration before starting
        if (!discordConfig.validate()) {
            logger.error(
                "Discord bot configuration is invalid. Please check your environment variables."
            );
            logger.warn(
                "Backend API will continue running without Discord bot. Check DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID in .env or cPanel environment variables."
            );
            return;
        }

        // Import bot index directly (skip start.ts to avoid duplicate .env loading)
        // Environment is already loaded by Environment.ts
        try {
            await import("./index");
            logger.info("Discord bot started successfully");
        } catch (error: any) {
            // If bot fails to start, log error but don't crash backend
            logger.error("Failed to start Discord bot:", error);
            logger.warn(
                "Backend API will continue running without Discord bot. Check your DISCORD_BOT_TOKEN and configuration."
            );

            // If it's a validation error, provide helpful message
            if (
                error?.message?.includes("configuration is invalid") ||
                error?.message?.includes("DISCORD_BOT_TOKEN")
            ) {
                logger.error(
                    "Discord bot configuration error. Please check your .env file or cPanel environment variables for DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID"
                );
            }
        }
    } catch (error) {
        // Catch any unexpected errors
        logger.error("Unexpected error while starting Discord bot:", error);
        logger.warn("Backend API will continue running without Discord bot");
    }
}
