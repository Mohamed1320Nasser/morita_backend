#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";
import logger from "../common/loggers";
import { discordConfig } from "./config/discord.config";

process.env.DOTENV_CONFIG_QUIET = "true";
logger.info("[BOT-START] Starting Discord bot...");

const envPath = resolve(__dirname, "../../.env");
const result = config({ path: envPath });

if (result.error) {
    logger.warn(`Failed to load .env from ${envPath}, trying process.cwd()/.env...`);
    const fallbackResult = config();
    if (fallbackResult.error) {
        logger.warn("Also failed to load .env from process.cwd(), continuing anyway...");
    } else {
        logger.info("Successfully loaded .env from process.cwd()");
    }
} else {
    logger.info("Successfully loaded .env from explicit path");
}

logger.info("Validating Discord configuration...");
if (!discordConfig.validate()) {
    logger.error("Discord bot configuration is INVALID!");

    const mainScript = process.argv[1] || "";
    const isStandalone =
        mainScript.includes("discord-bot/start") ||
        mainScript.includes("discord-bot\\start") ||
        mainScript.endsWith("start.js");

    if (isStandalone) {
        process.exit(1);
    } else {
        throw new Error(
            "Discord bot configuration is invalid. Please check your environment variables."
        );
    }
}
logger.info("Discord configuration validated");

// Import the client and startBot function
import { startBot } from "./index";

logger.info("Discord bot startup script loaded - starting bot explicitly...");
startBot();
