import logger from "../common/loggers";
import Environment from "../common/config/environment";
import { discordConfig } from "./config/discord.config";

export async function startDiscordBot(): Promise<void> {
    try {
        const botEnabled = process.env.DISCORD_BOT_ENABLED !== "false";

        if (!botEnabled) {
            logger.info("Discord bot is disabled (DISCORD_BOT_ENABLED=false)");
            return;
        }

        logger.info("Starting Discord bot...");

        if (!discordConfig.validate()) {
            logger.error(
                "Discord bot configuration is invalid. Please check your environment variables."
            );
            logger.warn(
                "Backend API will continue running without Discord bot. Check DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, and DISCORD_GUILD_ID in .env or cPanel environment variables."
            );
            return;
        }

        try {
            await import("./index");
            logger.info("Discord bot started successfully");
        } catch (error: any) {
            logger.error("Failed to start Discord bot:", error);
            logger.warn(
                "Backend API will continue running without Discord bot. Check your DISCORD_BOT_TOKEN and configuration."
            );

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
        logger.error("Unexpected error while starting Discord bot:", error);
        logger.warn("Backend API will continue running without Discord bot");
    }
}
