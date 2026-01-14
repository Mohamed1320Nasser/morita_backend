#!/usr/bin/env node

import { config } from "dotenv";
import { resolve } from "path";
import express from "express";
import cors from "cors";
import logger from "../common/loggers";
import { discordConfig } from "./config/discord.config";
import { onboardingConfig } from "./config/onboarding.config";

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

import { startBot } from "./index";
import discordClient from "./index";
import prisma from "../common/prisma/client";

logger.info("Discord bot startup script loaded - starting bot explicitly...");
startBot();

const BOT_API_PORT = process.env.BOT_API_PORT || 3002;

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        botConnected: discordClient.isReady(),
        botUsername: discordClient.user?.username,
    });
});

app.get("/discord/channels/status", async (req, res) => {
    try {
        const isConnected = discordClient.isReady();

        let dbStatuses: any[] = [];
        try {
            dbStatuses = await (prisma as any).discordChannelPublishStatus.findMany();
        } catch (error) {
            logger.debug("[Bot API] Channel status table not found");
        }

        const channels: any[] = [];

        const pricingStatus = dbStatuses.find(s => s.channelType === "PRICING");
        const pricingChannel = isConnected && discordConfig.pricingChannelId
            ? discordClient.channels.cache.get(discordConfig.pricingChannelId)
            : null;

        channels.push({
            channelType: "PRICING",
            channelId: discordConfig.pricingChannelId || null,
            channelName: pricingChannel ? (pricingChannel as any).name : null,
            status: pricingStatus?.status || "never_published",
            lastPublishedAt: pricingStatus?.lastPublishedAt || null,
            lastPublishedBy: pricingStatus?.lastPublishedBy || null,
            messageCount: pricingStatus?.messageCount || 0,
            lastError: pricingStatus?.lastError || null,
        });

        const tosStatus = dbStatuses.find(s => s.channelType === "TOS");
        const tosChannel = isConnected && onboardingConfig.tosChannelId
            ? discordClient.channels.cache.get(onboardingConfig.tosChannelId)
            : null;

        channels.push({
            channelType: "TOS",
            channelId: onboardingConfig.tosChannelId || null,
            channelName: tosChannel ? (tosChannel as any).name : null,
            status: tosStatus?.status || "never_published",
            lastPublishedAt: tosStatus?.lastPublishedAt || null,
            lastPublishedBy: tosStatus?.lastPublishedBy || null,
            messageCount: tosStatus?.messageCount || 0,
            lastError: tosStatus?.lastError || null,
        });

        const ticketsStatus = dbStatuses.find(s => s.channelType === "TICKETS");
        const ticketCategory = isConnected && discordConfig.createTicketCategoryId
            ? discordClient.channels.cache.get(discordConfig.createTicketCategoryId)
            : null;

        channels.push({
            channelType: "TICKETS",
            channelId: discordConfig.createTicketCategoryId || null,
            channelName: ticketCategory ? (ticketCategory as any).name : "CREATE TICKET (4 channels)",
            status: ticketsStatus?.status || "never_published",
            lastPublishedAt: ticketsStatus?.lastPublishedAt || null,
            lastPublishedBy: ticketsStatus?.lastPublishedBy || null,
            messageCount: ticketsStatus?.messageCount || 0,
            lastError: ticketsStatus?.lastError || null,
        });

        res.json({
            success: true,
            data: {
                botConnected: isConnected,
                botUsername: discordClient.user?.username,
                channels,
            },
        });
    } catch (error: any) {
        logger.error("[Bot API] Error getting channels status:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

async function updateChannelStatus(
    channelType: "PRICING" | "TOS" | "TICKETS",
    data: {
        status?: string;
        lastPublishedAt?: Date;
        lastPublishedBy?: number | null;
        messageCount?: number;
        channelId?: string | null;
        lastError?: string | null;
    }
): Promise<void> {
    try {
        await (prisma as any).discordChannelPublishStatus.upsert({
            where: { channelType: channelType },
            create: {
                channelType: channelType,
                channelId: data.channelId,
                status: data.status || "never_published",
                lastPublishedAt: data.lastPublishedAt,
                lastPublishedBy: data.lastPublishedBy,
                messageCount: data.messageCount || 0,
                lastError: data.lastError,
            },
            update: {
                ...(data.channelId !== undefined && { channelId: data.channelId }),
                ...(data.status !== undefined && { status: data.status }),
                ...(data.lastPublishedAt !== undefined && { lastPublishedAt: data.lastPublishedAt }),
                ...(data.lastPublishedBy !== undefined && { lastPublishedBy: data.lastPublishedBy }),
                ...(data.messageCount !== undefined && { messageCount: data.messageCount }),
                ...(data.lastError !== undefined && { lastError: data.lastError }),
            },
        });
    } catch (error) {
        logger.warn("[Bot API] Could not update channel status - migration may be needed");
    }
}

app.post("/discord/channels/publish/pricing", async (req, res) => {
    try {
        if (!discordClient.isReady()) {
            return res.status(400).json({ success: false, error: "Discord bot not connected" });
        }

        if (!discordClient.improvedChannelManager) {
            return res.status(400).json({ success: false, error: "Pricing channel manager not initialized" });
        }

        logger.info("[Bot API] Publishing pricing channel...");
        await discordClient.improvedChannelManager.rebuildChannel();

        const manager = discordClient.improvedChannelManager as any;
        const messageCount = manager.categoryMessages?.size || 0;

        await updateChannelStatus("PRICING", {
            status: "published",
            lastPublishedAt: new Date(),
            messageCount: messageCount + 2,
            channelId: discordConfig.pricingChannelId,
            lastError: null,
        });

        logger.info("[Bot API] Pricing channel published successfully");
        res.json({ success: true, message: "Pricing channel published successfully" });
    } catch (error: any) {
        logger.error("[Bot API] Error publishing pricing channel:", error);
        await updateChannelStatus("PRICING", { status: "error", lastError: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/discord/channels/publish/tos", async (req, res) => {
    try {
        if (!discordClient.isReady()) {
            return res.status(400).json({ success: false, error: "Discord bot not connected" });
        }

        if (!discordClient.tosManager) {
            return res.status(400).json({ success: false, error: "TOS manager not initialized" });
        }

        logger.info("[Bot API] Publishing TOS channel...");
        await discordClient.tosManager.publishTos();

        await updateChannelStatus("TOS", {
            status: "published",
            lastPublishedAt: new Date(),
            messageCount: 1,
            channelId: onboardingConfig.tosChannelId,
            lastError: null,
        });

        logger.info("[Bot API] TOS channel published successfully");
        res.json({ success: true, message: "TOS channel published successfully" });
    } catch (error: any) {
        logger.error("[Bot API] Error publishing TOS channel:", error);
        await updateChannelStatus("TOS", { status: "error", lastError: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/discord/channels/publish/tickets", async (req, res) => {
    try {
        if (!discordClient.isReady()) {
            return res.status(400).json({ success: false, error: "Discord bot not connected" });
        }

        if (!discordClient.ticketCategoryManager) {
            return res.status(400).json({ success: false, error: "Ticket category manager not initialized" });
        }

        logger.info("[Bot API] Publishing ticket channels...");
        await discordClient.ticketCategoryManager.publishTickets();

        await updateChannelStatus("TICKETS", {
            status: "published",
            lastPublishedAt: new Date(),
            messageCount: 4,
            channelId: discordConfig.createTicketCategoryId,
            lastError: null,
        });

        logger.info("[Bot API] Ticket channels published successfully");
        res.json({ success: true, message: "Ticket channels published successfully" });
    } catch (error: any) {
        logger.error("[Bot API] Error publishing ticket channels:", error);
        await updateChannelStatus("TICKETS", { status: "error", lastError: error.message });
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post("/discord/channels/publish/all", async (req, res) => {
    const results: { channel: string; success: boolean; error?: string }[] = [];

    try {
        if (discordClient.isReady() && discordClient.improvedChannelManager) {
            await discordClient.improvedChannelManager.rebuildChannel();
            const manager = discordClient.improvedChannelManager as any;
            const messageCount = manager.categoryMessages?.size || 0;
            await updateChannelStatus("PRICING", {
                status: "published",
                lastPublishedAt: new Date(),
                messageCount: messageCount + 2,
                channelId: discordConfig.pricingChannelId,
                lastError: null,
            });
            results.push({ channel: "PRICING", success: true });
        } else {
            results.push({ channel: "PRICING", success: false, error: "Not ready" });
        }
    } catch (error: any) {
        await updateChannelStatus("PRICING", { status: "error", lastError: error.message });
        results.push({ channel: "PRICING", success: false, error: error.message });
    }

    try {
        if (discordClient.isReady() && discordClient.tosManager) {
            await discordClient.tosManager.publishTos();
            await updateChannelStatus("TOS", {
                status: "published",
                lastPublishedAt: new Date(),
                messageCount: 1,
                channelId: onboardingConfig.tosChannelId,
                lastError: null,
            });
            results.push({ channel: "TOS", success: true });
        } else {
            results.push({ channel: "TOS", success: false, error: "Not ready" });
        }
    } catch (error: any) {
        await updateChannelStatus("TOS", { status: "error", lastError: error.message });
        results.push({ channel: "TOS", success: false, error: error.message });
    }

    try {
        if (discordClient.isReady() && discordClient.ticketCategoryManager) {
            await discordClient.ticketCategoryManager.publishTickets();
            await updateChannelStatus("TICKETS", {
                status: "published",
                lastPublishedAt: new Date(),
                messageCount: 4,
                channelId: discordConfig.createTicketCategoryId,
                lastError: null,
            });
            results.push({ channel: "TICKETS", success: true });
        } else {
            results.push({ channel: "TICKETS", success: false, error: "Not ready" });
        }
    } catch (error: any) {
        await updateChannelStatus("TICKETS", { status: "error", lastError: error.message });
        results.push({ channel: "TICKETS", success: false, error: error.message });
    }

    const allSuccess = results.every(r => r.success);
    res.json({
        success: allSuccess,
        message: allSuccess ? "All channels published successfully" : "Some channels failed to publish",
        results,
    });
});

app.listen(BOT_API_PORT, () => {
    logger.info(`[Bot API] Discord bot API server running on port ${BOT_API_PORT}`);
});
