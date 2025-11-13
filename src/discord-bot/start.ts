#!/usr/bin/env node

// Immediate console output for PM2 to capture (before logger initializes)
console.log("[BOT-START] Starting Discord bot...");
console.log("[BOT-START] Working directory:", process.cwd());
console.log("[BOT-START] Node version:", process.version);

import { config } from "dotenv";
import { resolve } from "path";
import logger from "../common/loggers";
import { discordConfig } from "./config/discord.config";

// Load environment variables (quiet mode - suppress annoying tips)
process.env.DOTENV_CONFIG_QUIET = "true";
console.log("[BOT-START] Loading environment variables...");

// Explicitly load .env from project root
// This ensures it works regardless of where the script is run from (PM2, direct execution, etc.)
// Try explicit path first (for compiled JS: build/discord-bot/start.js -> ../../.env = project root)
const envPath = resolve(__dirname, "../../.env");
console.log("[BOT-START] Attempting to load .env from:", envPath);
const result = config({ path: envPath });

// If explicit path didn't work (file not found), try loading from current working directory
// (PM2 sets cwd option, so process.cwd() should point to project root)
if (result.error) {
    console.warn(
        `[BOT-START] Failed to load .env from ${envPath}, trying process.cwd()/.env...`
    );
    logger.warn(
        `Failed to load .env from ${envPath}, trying process.cwd()/.env...`
    );
    const fallbackResult = config(); // Load from process.cwd()/.env
    if (fallbackResult.error) {
        console.error(
            `[BOT-START] Also failed to load .env from process.cwd(), continuing anyway...`
        );
        logger.warn(
            `Also failed to load .env from process.cwd(), continuing anyway...`
        );
    } else {
        console.log("[BOT-START] Successfully loaded .env from process.cwd()");
    }
} else {
    console.log("[BOT-START] Successfully loaded .env from explicit path");
}

// Validate configuration
console.log("[BOT-START] Validating Discord configuration...");
if (!discordConfig.validate()) {
    console.error("[BOT-START] ❌ Discord bot configuration is INVALID!");
    logger.error(
        "Discord bot configuration is invalid. Please check your environment variables."
    );

    // Only exit if running as standalone script (not when imported from app.ts)
    // Check if this file is being run directly (standalone mode)
    // When imported, the main script path won't match this file
    const mainScript = process.argv[1] || "";
    const isStandalone =
        mainScript.includes("discord-bot/start") ||
        mainScript.includes("discord-bot\\start") ||
        mainScript.endsWith("start.js");

    if (isStandalone) {
        // Running standalone - exit process
        process.exit(1);
    } else {
        // Being imported from app.ts - throw error instead of exiting
        // This allows app.ts to catch and handle the error gracefully
        throw new Error(
            "Discord bot configuration is invalid. Please check your environment variables."
        );
    }
}
console.log("[BOT-START] ✅ Discord configuration validated");

// Import and start the bot
console.log("[BOT-START] Importing bot index...");
import "./index";

console.log("[BOT-START] Bot startup script completed");
logger.info("Discord bot startup script loaded");
