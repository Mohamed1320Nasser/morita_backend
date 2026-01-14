import { Message, EmbedBuilder } from "discord.js";
import logger from "../../common/loggers";

export const MESSAGE_CONFIG = {
    ERROR_AUTO_DELETE_MS: 15000, 
    DELETE_USER_COMMAND: true, 
    KEEP_SUCCESS_MESSAGES: true, 
    EPHEMERAL_ERRORS_ONLY: true, 
};

export enum ErrorType {
    SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND",
    INVALID_FORMAT = "INVALID_FORMAT",
    INVALID_PARAMETERS = "INVALID_PARAMETERS",
    CALCULATION_ERROR = "CALCULATION_ERROR",
    API_ERROR = "API_ERROR",
}

export async function sendEphemeralError(
    message: Message,
    title: string,
    description: string,
    suggestions?: string[],
    deleteAfter: number = MESSAGE_CONFIG.ERROR_AUTO_DELETE_MS
): Promise<void> {
    try {
        const errorEmbed = new EmbedBuilder()
            .setColor("#FF4444") 
            .setTitle(`L ${title}`)
            .setDescription(description)
            .setTimestamp();

        if (suggestions && suggestions.length > 0) {
            errorEmbed.addFields({
                name: "=� Suggestions",
                value: suggestions.join("\n"),
            });
        }

        const reply = await message.reply({
            embeds: [errorEmbed.toJSON() as any],
        });

        // TODO: Uncomment to re-enable auto-delete of error messages after 15 seconds
        // setTimeout(async () => {
        //     try {
        //         await reply.delete();
        //         logger.debug(`[MessageHelper] Auto-deleted error message after ${deleteAfter}ms`);
        //     } catch (error) {
        //         logger.debug(`[MessageHelper] Could not delete error message: ${error}`);
        //     }
        // }, deleteAfter);

        // TODO: Uncomment to re-enable auto-delete of user command messages
        // if (MESSAGE_CONFIG.DELETE_USER_COMMAND) {
        //     setTimeout(async () => {
        //         try {
        //             await message.delete();
        //             logger.debug(`[MessageHelper] Auto-deleted user command message`);
        //         } catch (error) {
        //             logger.debug(`[MessageHelper] Could not delete user command: ${error}`);
        //         }
        //     }, deleteAfter);
        // }
    } catch (error) {
        logger.error(`[MessageHelper] Error sending ephemeral error:`, error);
    }
}

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

export async function deleteThinkingMessage(thinkingMsg: Message): Promise<void> {
    try {
        await thinkingMsg.delete();
        logger.debug(`[MessageHelper] Deleted thinking message`);
    } catch (error) {
        logger.debug(`[MessageHelper] Could not delete thinking message: ${error}`);
    }
}

export async function updateThinkingToError(
    thinkingMsg: Message,
    message: Message,
    title: string,
    description: string,
    suggestions?: string[]
): Promise<void> {
    
    await deleteThinkingMessage(thinkingMsg);

    await sendEphemeralError(message, title, description, suggestions);
}
