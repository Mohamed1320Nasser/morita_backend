

import logger from "../../common/loggers";

export const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
    "unknown message",
    "interaction token",
] as const;

export function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

export async function safeDeferReply(
    interaction: any,
    options: { ephemeral?: boolean } = {},
    logContext: string = "[Interaction]"
): Promise<boolean> {
    try {
        await interaction.deferReply(options);
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                `${logContext} Interaction expired (likely bot restart). User: ${interaction.user?.tag || "unknown"}`
            );
            return false;
        }
        throw error;
    }
}

export async function safeDeferUpdate(
    interaction: any,
    logContext: string = "[Interaction]"
): Promise<boolean> {
    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                `${logContext} Interaction expired (likely bot restart). User: ${interaction.user?.tag || "unknown"}`
            );
            return false;
        }
        throw error;
    }
}

export async function safeReply(
    interaction: any,
    content: any,
    logContext: string = "[Interaction]"
): Promise<boolean> {
    try {
        await interaction.reply(content);
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                `${logContext} Interaction expired during reply. User: ${interaction.user?.tag || "unknown"}`
            );
            return false;
        }
        throw error;
    }
}

export async function safeEditReply(
    interaction: any,
    content: any,
    logContext: string = "[Interaction]"
): Promise<boolean> {
    try {
        await interaction.editReply(content);
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                `${logContext} Interaction expired during editReply. User: ${interaction.user?.tag || "unknown"}`
            );
            return false;
        }
        throw error;
    }
}

export async function safeInteractionAction(
    interaction: any,
    action: () => Promise<void>,
    logContext: string = "[Interaction]"
): Promise<boolean> {
    try {
        await action();
        return true;
    } catch (error) {
        if (isInteractionExpiredError(error)) {
            logger.debug(
                `${logContext} Interaction expired. User: ${interaction.user?.tag || "unknown"}`
            );
            return false;
        }
        throw error;
    }
}

export function isInteractionValid(interaction: any): boolean {
    
    if (interaction.replied || interaction.deferred) {
        return false;
    }

    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const createdAt = interaction.createdTimestamp;
    const now = Date.now();
    const age = now - createdAt;

    if (age > FIFTEEN_MINUTES) {
        return false;
    }

    return true;
}
