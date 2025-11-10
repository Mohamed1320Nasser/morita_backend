import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import { config } from "dotenv";
import { join } from "path";
import { readdirSync } from "fs";
import { Command } from "./types/discord.types";
import { ApiService } from "./services/api.service";
import { ChannelManagerService } from "./services/channelManager.service";
import { ImprovedChannelManager } from "./services/improvedChannelManager.service";
import { EmbedBuilder } from "./utils/embedBuilder";
import { discordConfig } from "./config/discord.config";
import logger from "../common/loggers";

// Load environment variables (quiet mode - no tips)
// Note: Already loaded in start.ts, DOTENV_CONFIG_QUIET is set there
config();

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Required for reading message content (!s command)
    ],
});

// Create collections for commands and interactions
client.commands = new Collection<string, Command>();
client.apiService = new ApiService(discordConfig.apiBaseUrl);
// client.channelManager = new ChannelManagerService(client); // Legacy - DISABLED (was causing "Invalid Form Body" errors)
client.improvedChannelManager = new ImprovedChannelManager(client); // New system

// Load commands
const loadCommands = async () => {
    const commandsPath = join(__dirname, "commands");
    const commandFiles = readdirSync(commandsPath).filter(
        file => file.endsWith(".ts") || file.endsWith(".js")
    );

    for (const file of commandFiles) {
        const filePath = join(commandsPath, file);
        const command = await import(filePath);

        if ("data" in command.default && "execute" in command.default) {
            client.commands.set(
                command.default.data.name,
                command.default as any
            );
            logger.info(`Loaded command: ${command.default.data.name}`);
        } else {
            logger.warn(
                `The command at ${filePath} is missing a required "data" or "execute" property.`
            );
        }
    }
};

// Load events
const loadEvents = async () => {
    const eventsPath = join(__dirname, "events");
    const eventFiles = readdirSync(eventsPath).filter(
        file => file.endsWith(".ts") || file.endsWith(".js")
    );

    for (const file of eventFiles) {
        try {
            const filePath = join(eventsPath, file);
            const event = await import(filePath);

            if (!event.default || !event.default.name || !event.default.execute) {
                logger.warn(`Event file ${file} is missing required properties`);
                continue;
            }

            if (event.default.once) {
                client.once(event.default.name, (...args: any[]) =>
                    event.default.execute(...args)
                );
            } else {
                client.on(event.default.name, (...args: any[]) =>
                    event.default.execute(...args)
                );
            }

            logger.info(`Loaded event: ${event.default.name}`);
        } catch (error) {
            logger.error(`Failed to load event ${file}:`, error);
        }
    }
};

// Bot ready event
client.once(Events.ClientReady, async readyClient => {
    logger.info(`Discord bot ready! Logged in as ${readyClient.user.tag}`);

    // Set bot activity
    readyClient.user.setActivity("🎮 Morita Gaming | /help", { type: 1 });

    // Register slash commands
    try {
        const commands = Array.from(client.commands.values()).map(
            (cmd: any) => cmd.data
        );
        await readyClient.application?.commands.set(commands);
        logger.info(`Registered ${commands.length} slash commands`);
    } catch (error) {
        logger.error("Failed to register slash commands:", error);
    }

    // Initialize improved pricing channel manager with real-time updates
    try {
        await client.improvedChannelManager.initialize();
        logger.info("✅ Improved pricing channel manager initialized with real-time updates");
    } catch (error) {
        logger.error("Failed to initialize improved pricing channel manager:", error);
    }
});

// Error handling
client.on(Events.Error, error => {
    logger.error("Discord client error:", error);
});

process.on("unhandledRejection", error => {
    logger.error("Unhandled promise rejection:", error);
});

// Login to Discord
const startBot = async () => {
    try {
        await loadCommands();
        await loadEvents();

        if (!discordConfig.token) {
            throw new Error(
                "Discord bot token is not configured. Please check your environment variables or config fallbacks."
            );
        }

        await client.login(discordConfig.token);
    } catch (error) {
        logger.error("Failed to start Discord bot:", error);
        process.exit(1);
    }
};

// Start the bot
startBot();

export default client;
