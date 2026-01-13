import { Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";

/**
 * Message Configuration
 */
export const MESSAGE_CONFIG = {
    ERROR_AUTO_DELETE_MS: 15000, // 15 seconds
    DELETE_USER_COMMAND: true, // Delete user's command on error
    KEEP_SUCCESS_MESSAGES: true, // Don't auto-delete success
    EPHEMERAL_ERRORS_ONLY: true, // Only errors are ephemeral
};

/**
 * Error Types for Calculator Commands
 */
export enum ErrorType {
    SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND",
    INVALID_FORMAT = "INVALID_FORMAT",
    INVALID_PARAMETERS = "INVALID_PARAMETERS",
    CALCULATION_ERROR = "CALCULATION_ERROR",
    API_ERROR = "API_ERROR",
}

/**
 * Send ephemeral error message (only visible to user, auto-deletes)
 *
 * @param message - Discord message object
 * @param title - Error title
 * @param description - Error description
 * @param suggestions - Optional array of suggestion strings
 * @param deleteAfter - Time in ms before auto-delete (default: 15000)
 */
export async function sendEphemeralError(
    message: Message,
    title: string,
    description: string,
    suggestions?: string[],
    deleteAfter: number = MESSAGE_CONFIG.ERROR_AUTO_DELETE_MS
): Promise<void> {
    try {
        const errorEmbed = new EmbedBuilder()
            .setColor("#FF4444") // Red color
            .setTitle(`L ${title}`)
            .setDescription(description)
            .setTimestamp();

        if (suggestions && suggestions.length > 0) {
            errorEmbed.addFields({
                name: "=� Suggestions",
                value: suggestions.join("\n"),
            });
        }

        // Send error message
        const reply = await message.reply({
            embeds: [errorEmbed.toJSON() as any],
        });

        // Auto-delete error message after specified time
        setTimeout(async () => {
            try {
                await reply.delete();
                logger.debug(`[MessageHelper] Auto-deleted error message after ${deleteAfter}ms`);
            } catch (error) {
                logger.debug(`[MessageHelper] Could not delete error message: ${error}`);
            }
        }, deleteAfter);

        // Optionally delete user's command message
        if (MESSAGE_CONFIG.DELETE_USER_COMMAND) {
            setTimeout(async () => {
                try {
                    await message.delete();
                    logger.debug(`[MessageHelper] Auto-deleted user command message`);
                } catch (error) {
                    logger.debug(`[MessageHelper] Could not delete user command: ${error}`);
                }
            }, deleteAfter);
        }
    } catch (error) {
        logger.error(`[MessageHelper] Error sending ephemeral error:`, error);
    }
}

/**
 * Send validation error (invalid format, missing parameters)
 *
 * @param message - Discord message object
 * @param commandExample - Example of correct command usage
 * @param issue - What's wrong with the command
 */
export async function sendValidationError(
    message: Message,
    commandExample: string,
    issue: string
): Promise<void> {
    const description = `**Problem:** ${issue}\n\n**Correct format:**\n\`\`\`${commandExample}\`\`\``;

    await sendEphemeralError(
        message,
        "Invalid Command Format",
        description,
        [
            "Make sure you include all required parameters",
            "Check for typos in your command",
        ]
    );
}

/**
 * Send "service not found" error with suggestions
 *
 * @param message - Discord message object
 * @param serviceName - The service name that wasn't found
 * @param commandType - Type of command (PvM, Skills, Minigames, etc.)
 * @param examples - Array of example commands
 */
export async function sendServiceNotFoundError(
    message: Message,
    serviceName: string,
    commandType: string,
    examples: string[]
): Promise<void> {
    const description = `Could not find a ${commandType} service or group matching **"${serviceName}"**.\n\nMake sure the service supports the correct pricing type.`;

    const suggestions = [
        `**Try:** ${examples.map(ex => `\`${ex}\``).join(", ")}`,
        "Use `/services` to see all available services",
    ];

    await sendEphemeralError(
        message,
        "Service Not Found",
        description,
        suggestions
    );
}

/**
 * Send "invalid parameters" error
 *
 * @param message - Discord message object
 * @param parameterName - Name of the invalid parameter
 * @param value - The invalid value provided
 * @param requirement - What the parameter should be
 */
export async function sendInvalidParameterError(
    message: Message,
    parameterName: string,
    value: any,
    requirement: string
): Promise<void> {
    const description = `**Parameter:** ${parameterName}\n**Your value:** ${value}\n**Requirement:** ${requirement}`;

    await sendEphemeralError(
        message,
        "Invalid Parameters",
        description,
        ["Please check your input and try again"]
    );
}

/**
 * Send API/Calculation error
 *
 * @param message - Discord message object
 * @param errorMessage - Error message from API
 */
export async function sendCalculationError(
    message: Message,
    errorMessage: string
): Promise<void> {
    const description = `An error occurred while calculating the price:\n\n\`\`\`${errorMessage}\`\`\``;

    await sendEphemeralError(
        message,
        "Calculation Error",
        description,
        [
            "Please try again in a moment",
            "If the issue persists, contact support",
        ]
    );
}

/**
 * Delete a "thinking" message safely
 *
 * @param thinkingMsg - The thinking message to delete
 */
export async function deleteThinkingMessage(thinkingMsg: Message): Promise<void> {
    try {
        await thinkingMsg.delete();
        logger.debug(`[MessageHelper] Deleted thinking message`);
    } catch (error) {
        logger.debug(`[MessageHelper] Could not delete thinking message: ${error}`);
    }
}

/**
 * Update thinking message to show an error (for backwards compatibility)
 * Use sendEphemeralError instead for new implementations
 *
 * @deprecated Use sendEphemeralError instead
 */
export async function updateThinkingToError(
    thinkingMsg: Message,
    message: Message,
    title: string,
    description: string,
    suggestions?: string[]
): Promise<void> {
    // Delete thinking message
    await deleteThinkingMessage(thinkingMsg);

    // Send ephemeral error
    await sendEphemeralError(message, title, description, suggestions);
}
