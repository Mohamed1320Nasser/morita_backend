/**
 * Interaction Helper Utilities
 *
 * Centralized utilities for handling Discord interactions safely,
 * especially handling expired interactions after bot restarts.
 */

import logger from "../../common/loggers";

/**
 * Error messages that indicate an interaction is no longer valid
 *
 * Common scenarios:
 * - Bot restarted (all old interactions become invalid)
 * - Interaction token expired (15-minute timeout)
 * - Message was deleted
 * - User clicked too late
 */
export const INTERACTION_EXPIRED_ERRORS = [
    "unknown interaction",
    "interaction has already been acknowledged",
    "already been acknowledged",
    "unknown message",
    "interaction token",
] as const;

/**
 * Check if an error indicates the interaction expired
 *
 * @param error - The error to check
 * @returns true if the error is an expired interaction error
 *
 * @example
 * ```typescript
 * try {
 *   await interaction.reply({ content: "Hello!" });
 * } catch (error) {
 *   if (isInteractionExpiredError(error)) {
 *     // Silently fail - user already knows
 *     return;
 *   }
 *   throw error; // Re-throw other errors
 * }
 * ```
 */
export function isInteractionExpiredError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return INTERACTION_EXPIRED_ERRORS.some(err => message.includes(err));
}

/**
 * Safely defer an interaction reply
 *
 * Handles expired interactions gracefully (e.g., after bot restart)
 *
 * @param interaction - The interaction to defer
 * @param options - Defer options
 * @param logContext - Context for logging (e.g., "[MyHandler]")
 * @returns true if successful, false if interaction expired
 *
 * @example
 * ```typescript
 * const deferred = await safeDeferReply(interaction, { ephemeral: true }, "[MyHandler]");
 * if (!deferred) {
 *   return; // Interaction expired, exit gracefully
 * }
 * // Continue processing...
 * ```
 */
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

/**
 * Safely defer an interaction update
 *
 * Used for button/select menu interactions that update existing messages
 *
 * @param interaction - The interaction to defer
 * @param logContext - Context for logging
 * @returns true if successful, false if interaction expired
 */
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

/**
 * Safely reply to an interaction
 *
 * @param interaction - The interaction to reply to
 * @param content - Reply content
 * @param logContext - Context for logging
 * @returns true if successful, false if interaction expired
 */
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

/**
 * Safely edit an interaction reply
 *
 * @param interaction - The interaction to edit
 * @param content - New content
 * @param logContext - Context for logging
 * @returns true if successful, false if interaction expired
 */
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

/**
 * Execute an interaction action safely with automatic error handling
 *
 * This is a high-level wrapper that handles all common interaction scenarios
 *
 * @param interaction - The interaction
 * @param action - Async function to execute
 * @param logContext - Context for logging
 * @returns true if successful, false if interaction expired
 *
 * @example
 * ```typescript
 * const success = await safeInteractionAction(interaction, async () => {
 *   await interaction.deferReply({ ephemeral: true });
 *   const data = await fetchData();
 *   await interaction.editReply({ content: data });
 * }, "[MyHandler]");
 *
 * if (!success) {
 *   // Interaction expired, logged automatically
 *   return;
 * }
 * ```
 */
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

/**
 * Check if an interaction is still valid (not expired, not already handled)
 *
 * @param interaction - The interaction to check
 * @returns true if valid, false if expired or already handled
 */
export function isInteractionValid(interaction: any): boolean {
    // Check if already replied or deferred
    if (interaction.replied || interaction.deferred) {
        return false;
    }

    // Check if created more than 15 minutes ago (Discord token expiry)
    const FIFTEEN_MINUTES = 15 * 60 * 1000;
    const createdAt = interaction.createdTimestamp;
    const now = Date.now();
    const age = now - createdAt;

    if (age > FIFTEEN_MINUTES) {
        return false;
    }

    return true;
}
