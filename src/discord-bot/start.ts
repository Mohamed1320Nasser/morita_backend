#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";
import logger from "../common/loggers";
import { discordConfig } from "./config/discord.config";

// Load environment variables (quiet mode - suppress annoying tips)
process.env.DOTENV_CONFIG_QUIET = "true";

// Explicitly load .env from project root
// This ensures it works regardless of where the script is run from (PM2, direct execution, etc.)
// Try explicit path first (for compiled JS: build/discord-bot/start.js -> ../../.env = project root)
const envPath = resolve(__dirname, "../../.env");
const result = config({ path: envPath });

// If explicit path didn't work (file not found), try loading from current working directory
// (PM2 sets cwd option, so process.cwd() should point to project root)
if (result.error) {
    logger.warn(
        `Failed to load .env from ${envPath}, trying process.cwd()/.env...`
    );
    const fallbackResult = config(); // Load from process.cwd()/.env
    if (fallbackResult.error) {
        logger.warn(
            `Also failed to load .env from process.cwd(), continuing anyway...`
        );
    }
}

// Validate configuration
if (!discordConfig.validate()) {
    logger.error(
        "Discord bot configuration is invalid. Please check your environment variables."
    );
    process.exit(1);
}

// Import and start the bot
import "./index";

logger.info("Discord bot startup script loaded");
