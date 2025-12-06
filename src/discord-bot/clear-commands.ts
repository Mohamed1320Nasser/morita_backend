import { REST, Routes } from "discord.js";
import { discordConfig } from "./config/discord.config";
import logger from "../common/loggers";
import Environment from "../common/config/environment";

/**
 * Script to clear all Discord slash commands (both global and guild)
 * Run this to remove duplicate commands
 */

const clearCommands = async () => {
    try {
        if (!discordConfig.token) {
            throw new Error("Discord bot token not found in config");
        }

        if (!discordConfig.clientId) {
            throw new Error("Discord client ID not found in config");
        }

        const rest = new REST().setToken(discordConfig.token);

        logger.info("🧹 Starting command cleanup...");

        // Clear global commands
        logger.info("Clearing global commands...");
        await rest.put(Routes.applicationCommands(discordConfig.clientId), {
            body: [],
        });
        logger.info("✅ Global commands cleared");

        // Clear guild commands if guild ID is configured
        if (discordConfig.guildId) {
            logger.info(`Clearing guild commands for guild ${discordConfig.guildId}...`);
            await rest.put(
                Routes.applicationGuildCommands(
                    discordConfig.clientId,
                    discordConfig.guildId
                ),
                { body: [] }
            );
            logger.info("✅ Guild commands cleared");
        }

        logger.info("✅ All commands cleared successfully!");
        logger.info("Now restart your Discord bot to re-register commands.");
        process.exit(0);
    } catch (error) {
        logger.error("❌ Error clearing commands:", error);
        process.exit(1);
    }
};

clearCommands();
