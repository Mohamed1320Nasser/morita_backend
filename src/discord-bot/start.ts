#!/usr/bin/env node

import { config } from "dotenv";
import logger from "../common/loggers";
import { discordConfig } from "./config/discord.config";

// Load environment variables (quiet mode - suppress annoying tips)
process.env.DOTENV_CONFIG_QUIET = 'true';
config();

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
