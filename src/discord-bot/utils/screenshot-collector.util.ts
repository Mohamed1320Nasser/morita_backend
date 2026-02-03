import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    TextChannel,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Message,
    ComponentType,
} from "discord.js";
import logger from "../../common/loggers";

export interface CollectedScreenshots {
    urls: string[];
    success: boolean;
    cancelled: boolean;
}

interface ScreenshotCollectorOptions {
    minScreenshots?: number;
    maxScreenshots?: number;
    timeoutMs?: number;
}

const DEFAULT_OPTIONS = {
    minScreenshots: 1,
    maxScreenshots: 5,
    timeoutMs: 300000,
};

const VALID_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];

function isValidImage(contentType: string, fileName: string): boolean {
    if (contentType.startsWith("image/")) return true;
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    return VALID_IMAGE_EXTENSIONS.includes(extension);
}

function createScreenshotEmbed(
    orderNumber: number,
    min: number,
    max: number,
    collected: number,
    isProofMode: boolean = false
): EmbedBuilder {
    const canContinue = collected >= min;
    const title = isProofMode ? "📸 Upload Proof Screenshots" : "📸 Upload Completion Screenshots";
    const description = isProofMode
        ? `Please upload proof screenshot(s) for **Order #${orderNumber}**.\n\nUpload your images in this channel, then click **Save Proof** when done.`
        : `Please upload screenshot proof of your completed work for **Order #${orderNumber}**.\n\nUpload your images in this channel, then click **Continue** when done.`;

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .addFields([
            {
                name: "📋 Requirements",
                value: `• Minimum: **${min}** screenshot${min > 1 ? "s" : ""}\n• Maximum: **${max}** screenshots\n• Formats: PNG, JPG, GIF, WebP`,
                inline: true,
            },
            {
                name: "📊 Status",
                value: collected > 0 ? `✅ **${collected}** screenshot${collected > 1 ? "s" : ""} uploaded` : "⏳ Waiting for uploads...",
                inline: true,
            },
        ])
        .setColor(canContinue ? 0x57f287 : 0xf59e0b)
        .setFooter({ text: "You have 5 minutes to upload your screenshots" })
        .setTimestamp();
}

function createScreenshotButtons(buttonPrefix: string, orderId: string, canContinue: boolean, isProofMode: boolean = false): ActionRowBuilder<ButtonBuilder> {
    const continueLabel = isProofMode ? "Save Proof" : "Continue";
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${buttonPrefix}_continue_${orderId}`)
            .setLabel(continueLabel)
            .setStyle(ButtonStyle.Success)
            .setDisabled(!canContinue),
        new ButtonBuilder()
            .setCustomId(`${buttonPrefix}_cancel_${orderId}`)
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Secondary)
    );
}

export async function collectCompletionScreenshots(
    interaction: ButtonInteraction | ChatInputCommandInteraction,
    orderId: string,
    orderNumber: number,
    options: ScreenshotCollectorOptions = {}
): Promise<CollectedScreenshots> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const collectedUrls: string[] = [];
    const buttonPrefix = `ss_${Date.now().toString(36)}`;

    const channel = interaction.channel;
    if (!channel || !(channel instanceof TextChannel)) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ This can only be used in a text channel.", ephemeral: true });
        }
        return { urls: [], success: false, cancelled: false };
    }

    const embed = createScreenshotEmbed(orderNumber, opts.minScreenshots, opts.maxScreenshots, 0);
    const buttons = createScreenshotButtons(buttonPrefix, orderId, false);

    const response = await interaction.reply({
        embeds: [embed.toJSON() as any],
        components: [buttons.toJSON() as any],
        fetchReply: true,
    });

    const promptMessage = response as Message;

    const messageCollector = channel.createMessageCollector({
        filter: (m: Message) => m.author.id === interaction.user.id && m.attachments.size > 0,
        time: opts.timeoutMs,
    });

    return new Promise<CollectedScreenshots>((resolve) => {
        let resolved = false;

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                messageCollector.stop();
            }
        };

        messageCollector.on("collect", async (message: Message) => {
            for (const [, attachment] of message.attachments) {
                if (collectedUrls.length >= opts.maxScreenshots) break;
                if (isValidImage(attachment.contentType?.toLowerCase() || "", attachment.name?.toLowerCase() || "")) {
                    collectedUrls.push(attachment.url);
                }
            }

            try { await message.react("✅"); } catch {}

            const canContinue = collectedUrls.length >= opts.minScreenshots;
            const updatedEmbed = createScreenshotEmbed(orderNumber, opts.minScreenshots, opts.maxScreenshots, collectedUrls.length);
            const updatedButtons = createScreenshotButtons(buttonPrefix, orderId, canContinue);

            try {
                await promptMessage.edit({
                    embeds: [updatedEmbed.toJSON() as any],
                    components: [updatedButtons.toJSON() as any],
                });
            } catch {}
        });

        messageCollector.on("end", async (_, reason) => {
            if (resolved) return;
            if (reason === "time") {
                cleanup();
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle("⏰ Screenshot Upload Timed Out")
                    .setDescription("Please try again using the Mark Complete button or command.")
                    .setColor(0xed4245)
                    .setTimestamp();
                try { await promptMessage.edit({ embeds: [timeoutEmbed.toJSON() as any], components: [] }); } catch {}
                resolve({ urls: [], success: false, cancelled: false });
            }
        });

        const buttonCollector = promptMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith(`${buttonPrefix}_`),
            time: opts.timeoutMs,
        });

        buttonCollector.on("collect", async (btnInteraction) => {
            if (resolved) return;

            if (btnInteraction.customId.includes("_cancel_")) {
                cleanup();
                buttonCollector.stop();
                const cancelEmbed = new EmbedBuilder()
                    .setTitle("❌ Completion Cancelled")
                    .setDescription("You have cancelled the order completion process.")
                    .setColor(0xed4245)
                    .setTimestamp();
                await btnInteraction.update({ embeds: [cancelEmbed.toJSON() as any], components: [] });
                resolve({ urls: [], success: false, cancelled: true });
                return;
            }

            if (btnInteraction.customId.includes("_continue_")) {
                if (collectedUrls.length < opts.minScreenshots) {
                    await btnInteraction.reply({
                        content: `❌ Please upload at least **${opts.minScreenshots}** screenshot before continuing.`,
                        ephemeral: true,
                    });
                    return;
                }

                cleanup();
                buttonCollector.stop();
                const successEmbed = new EmbedBuilder()
                    .setTitle("✅ Screenshots Collected")
                    .setDescription(`Successfully collected **${collectedUrls.length}** screenshot${collectedUrls.length !== 1 ? "s" : ""}.\n\nProceeding to completion form...`)
                    .setColor(0x57f287)
                    .setTimestamp();
                await btnInteraction.update({ embeds: [successEmbed.toJSON() as any], components: [] });

                logger.info(`[ScreenshotCollector] Collected ${collectedUrls.length} screenshots for order ${orderId}`);
                resolve({ urls: collectedUrls, success: true, cancelled: false });
            }
        });
    });
}

/**
 * Collect proof screenshots using the same UI flow as completion screenshots
 * - Shows embed with "Save Proof" and "Cancel" buttons
 * - Adds checkmark reaction to uploaded images
 * - Does NOT delete user's images
 */
export async function collectProofScreenshots(
    interaction: ButtonInteraction | ChatInputCommandInteraction,
    orderId: string,
    orderNumber: number,
    options: ScreenshotCollectorOptions = {}
): Promise<CollectedScreenshots> {
    const opts = { ...DEFAULT_OPTIONS, ...options, maxScreenshots: 10 };
    const collectedUrls: string[] = [];
    const buttonPrefix = `proof_${Date.now().toString(36)}`;

    const channel = interaction.channel;
    if (!channel || !(channel instanceof TextChannel)) {
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ This can only be used in a text channel.", ephemeral: true });
        }
        return { urls: [], success: false, cancelled: false };
    }

    const embed = createScreenshotEmbed(orderNumber, opts.minScreenshots, opts.maxScreenshots, 0, true);
    const buttons = createScreenshotButtons(buttonPrefix, orderId, false, true);

    const response = await interaction.reply({
        embeds: [embed.toJSON() as any],
        components: [buttons.toJSON() as any],
        fetchReply: true,
    });

    const promptMessage = response as Message;

    const messageCollector = channel.createMessageCollector({
        filter: (m: Message) => m.author.id === interaction.user.id && m.attachments.size > 0,
        time: opts.timeoutMs,
    });

    return new Promise<CollectedScreenshots>((resolve) => {
        let resolved = false;

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                messageCollector.stop();
            }
        };

        messageCollector.on("collect", async (message: Message) => {
            for (const [, attachment] of message.attachments) {
                if (collectedUrls.length >= opts.maxScreenshots) break;
                if (isValidImage(attachment.contentType?.toLowerCase() || "", attachment.name?.toLowerCase() || "")) {
                    collectedUrls.push(attachment.url);
                }
            }

            // Add checkmark reaction to acknowledge receipt
            try { await message.react("✅"); } catch {}

            const canContinue = collectedUrls.length >= opts.minScreenshots;
            const updatedEmbed = createScreenshotEmbed(orderNumber, opts.minScreenshots, opts.maxScreenshots, collectedUrls.length, true);
            const updatedButtons = createScreenshotButtons(buttonPrefix, orderId, canContinue, true);

            try {
                await promptMessage.edit({
                    embeds: [updatedEmbed.toJSON() as any],
                    components: [updatedButtons.toJSON() as any],
                });
            } catch {}
        });

        messageCollector.on("end", async (_, reason) => {
            if (resolved) return;
            if (reason === "time") {
                cleanup();
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle("⏰ Screenshot Upload Timed Out")
                    .setDescription("Please try again using the /add-proof command.")
                    .setColor(0xed4245)
                    .setTimestamp();
                try { await promptMessage.edit({ embeds: [timeoutEmbed.toJSON() as any], components: [] }); } catch {}
                resolve({ urls: [], success: false, cancelled: false });
            }
        });

        const buttonCollector = promptMessage.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith(`${buttonPrefix}_`),
            time: opts.timeoutMs,
        });

        buttonCollector.on("collect", async (btnInteraction) => {
            if (resolved) return;

            if (btnInteraction.customId.includes("_cancel_")) {
                cleanup();
                buttonCollector.stop();
                const cancelEmbed = new EmbedBuilder()
                    .setTitle("❌ Proof Upload Cancelled")
                    .setDescription("You have cancelled the proof upload process.")
                    .setColor(0xed4245)
                    .setTimestamp();
                await btnInteraction.update({ embeds: [cancelEmbed.toJSON() as any], components: [] });
                resolve({ urls: [], success: false, cancelled: true });
                return;
            }

            if (btnInteraction.customId.includes("_continue_")) {
                if (collectedUrls.length < opts.minScreenshots) {
                    await btnInteraction.reply({
                        content: `❌ Please upload at least **${opts.minScreenshots}** screenshot before saving.`,
                        ephemeral: true,
                    });
                    return;
                }

                cleanup();
                buttonCollector.stop();
                const successEmbed = new EmbedBuilder()
                    .setTitle("✅ Proof Screenshots Saved")
                    .setDescription(`Successfully saved **${collectedUrls.length}** proof screenshot${collectedUrls.length !== 1 ? "s" : ""} to the order.`)
                    .setColor(0x57f287)
                    .setTimestamp();
                await btnInteraction.update({ embeds: [successEmbed.toJSON() as any], components: [] });

                logger.info(`[ScreenshotCollector] Collected ${collectedUrls.length} proof screenshots for order ${orderId}`);
                resolve({ urls: collectedUrls, success: true, cancelled: false });
            }
        });
    });
}

interface PendingScreenshotData {
    urls: string[];
    timestamp: number;
    interactionToDelete?: ButtonInteraction;
}

const pendingScreenshots = new Map<string, PendingScreenshotData>();
const SCREENSHOT_CACHE_TTL = 600000;

export function storePendingScreenshots(orderId: string, urls: string[], interactionToDelete?: ButtonInteraction): void {
    pendingScreenshots.set(orderId, { urls, timestamp: Date.now(), interactionToDelete });
    for (const [id, entry] of pendingScreenshots.entries()) {
        if (Date.now() - entry.timestamp > SCREENSHOT_CACHE_TTL) {
            pendingScreenshots.delete(id);
        }
    }
}

export function getPendingScreenshots(orderId: string): string[] | null {
    const entry = pendingScreenshots.get(orderId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > SCREENSHOT_CACHE_TTL) {
        pendingScreenshots.delete(orderId);
        return null;
    }
    // Don't delete yet - we need to clean up the interaction too
    return entry.urls;
}

export async function cleanupPendingScreenshots(orderId: string): Promise<void> {
    const entry = pendingScreenshots.get(orderId);
    if (!entry) return;

    // Try to delete the ephemeral message
    if (entry.interactionToDelete) {
        try {
            await entry.interactionToDelete.deleteReply();
            logger.info(`[ScreenshotCollector] Deleted ephemeral message for order ${orderId}`);
        } catch (err) {
            // Ignore - message may already be deleted or expired
        }
    }

    pendingScreenshots.delete(orderId);
}
