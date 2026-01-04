import { CommandInteraction, ButtonInteraction, ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import logger from "../loggers";
import { ErrorCode } from "./apiResponse.util";

/**
 * Custom Application Errors
 */
export class AppError extends Error {
    constructor(
        public code: ErrorCode,
        message: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = "AppError";
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
        super(ErrorCode.VALIDATION_ERROR, message, 400, details);
        this.name = "ValidationError";
    }
}

export class UnauthorizedError extends AppError {
    constructor(message: string = "Unauthorized access") {
        super(ErrorCode.UNAUTHORIZED, message, 401);
        this.name = "UnauthorizedError";
    }
}

export class ForbiddenError extends AppError {
    constructor(message: string = "Access forbidden") {
        super(ErrorCode.FORBIDDEN, message, 403);
        this.name = "ForbiddenError";
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string = "Resource") {
        super(ErrorCode.NOT_FOUND, `${resource} not found`, 404);
        this.name = "NotFoundError";
    }
}

export class ConflictError extends AppError {
    constructor(message: string) {
        super(ErrorCode.CONFLICT, message, 409);
        this.name = "ConflictError";
    }
}

export class InsufficientBalanceError extends AppError {
    constructor(
        required: number,
        available: number,
        role?: 'customer' | 'worker',
        additionalDetails?: { deposit?: number; balance?: number }
    ) {
        // Build role-specific message
        let message = `Insufficient balance. Required: $${required.toFixed(2)}, Available: $${available.toFixed(2)}`;

        if (role === 'customer') {
            message = `Customer has insufficient balance to place this order.\n\n` +
                `**Required Deposit:** $${required.toFixed(2)}\n` +
                `**Customer's Available Balance:** $${available.toFixed(2)}\n\n` +
                `Please ask the customer to add more funds using /add-balance first.`;
        } else if (role === 'worker') {
            message = `Worker has insufficient eligibility to accept this order.\n\n` +
                `**Required Deposit:** $${required.toFixed(2)}\n` +
                `**Worker's Total Eligibility:** $${available.toFixed(2)}`;

            if (additionalDetails?.deposit !== undefined && additionalDetails?.balance !== undefined) {
                message += `\n\n**Breakdown:**\n` +
                    `• Deposit: $${additionalDetails.deposit.toFixed(2)}\n` +
                    `• Free Balance: $${additionalDetails.balance.toFixed(2)}\n` +
                    `• Total Eligibility: $${(additionalDetails.deposit + additionalDetails.balance).toFixed(2)}`;

                if (additionalDetails.balance < 0) {
                    message += `\n\n⚠️ **WARNING:** Worker has NEGATIVE balance ($${additionalDetails.balance.toFixed(2)})\n` +
                        `This indicates a data integrity issue that needs admin attention.`;
                }
            }

            message += `\n\nWorker needs to complete existing orders or add more funds to their deposit.`;
        }

        super(
            ErrorCode.INSUFFICIENT_BALANCE,
            message,
            400,
            { required, available, role, ...additionalDetails }
        );
        this.name = "InsufficientBalanceError";
    }
}

export class RateLimitError extends AppError {
    constructor(retryAfter: number) {
        super(
            ErrorCode.RATE_LIMIT_EXCEEDED,
            `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
            429,
            { retryAfter }
        );
        this.name = "RateLimitError";
    }
}

/**
 * Unified Discord Interaction Error Handler
 * Handles all Discord interaction errors consistently
 */
export class DiscordErrorHandler {
    /**
     * Handle errors for any Discord interaction type
     */
    static async handle(
        interaction: CommandInteraction | ButtonInteraction | ModalSubmitInteraction,
        error: any,
        context?: string
    ): Promise<void> {
        const contextStr = context ? `[${context}]` : "";
        logger.error(`${contextStr} Discord interaction error:`, {
            error: error?.message || String(error),
            stack: error?.stack,
            user: interaction.user.tag,
            guild: interaction.guild?.name,
            interactionType: interaction.type
        });

        // Check for Discord API errors
        if (this.isInteractionExpired(error)) {
            logger.warn(`${contextStr} Interaction expired - user may need to retry`);
            // Cannot reply to expired interaction
            return;
        }

        // Build user-friendly error message
        const errorMessage = this.getUserFriendlyMessage(error);
        const embed = this.createErrorEmbed(errorMessage, error);

        // Try to send error to user
        try {
            if (interaction.replied) {
                // Already replied, can't do anything
                logger.warn(`${contextStr} Interaction already replied, cannot send error`);
            } else if (interaction.deferred) {
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        } catch (sendError) {
            logger.error(`${contextStr} Failed to send error message to user:`, sendError);
        }
    }

    /**
     * Check if error is due to expired interaction
     */
    private static isInteractionExpired(error: any): boolean {
        return (
            error?.message?.includes("Unknown interaction") ||
            error?.code === 10062 ||
            error?.code === "INTERACTION_TIMEOUT"
        );
    }

    /**
     * Convert error to user-friendly message
     */
    private static getUserFriendlyMessage(error: any): string {
        // Custom app errors
        if (error instanceof AppError) {
            return error.message;
        }

        // Prisma errors
        if (error?.code?.startsWith("P")) {
            return "A database error occurred. Please try again later.";
        }

        // Validation errors
        if (error?.name === "ValidationError" || error?.errors) {
            return "Invalid input provided. Please check your data and try again.";
        }

        // Network/timeout errors
        if (error?.code === "ETIMEDOUT" || error?.code === "ECONNREFUSED") {
            return "Service temporarily unavailable. Please try again later.";
        }

        // Generic fallback
        return "An unexpected error occurred. Please try again or contact support.";
    }

    /**
     * Create error embed
     */
    private static createErrorEmbed(message: string, error?: any): any {
        const embed = new EmbedBuilder()
            .setTitle("❌ Error")
            .setDescription(message)
            .setColor(0xed4245)
            .setTimestamp();

        // Add error code if available (for debugging)
        if (error instanceof AppError && process.env.NODE_ENV === "development") {
            embed.setFooter({ text: `Error Code: ${error.code}` });
        }

        return embed.toJSON();
    }

    /**
     * Handle async interaction safely (wrapper)
     */
    static async safeHandle<T extends CommandInteraction | ButtonInteraction | ModalSubmitInteraction>(
        interaction: T,
        handler: (interaction: T) => Promise<void>,
        context?: string
    ): Promise<void> {
        try {
            await handler(interaction);
        } catch (error) {
            await this.handle(interaction, error, context);
        }
    }
}

/**
 * Sanitize error for logging (remove sensitive data)
 */
export function sanitizeError(error: any): any {
    if (!error) return error;

    const sanitized: any = {
        message: error.message,
        name: error.name,
        code: error.code
    };

    // Include stack trace in development only
    if (process.env.NODE_ENV === "development") {
        sanitized.stack = error.stack;
    }

    // Remove sensitive fields
    const sensitiveFields = ["password", "token", "apiKey", "secret"];
    if (error.details) {
        sanitized.details = { ...error.details };
        sensitiveFields.forEach(field => {
            if (field in sanitized.details) {
                sanitized.details[field] = "[REDACTED]";
            }
        });
    }

    return sanitized;
}

/**
 * Log error with context
 */
export function logError(context: string, error: any, additionalInfo?: any): void {
    logger.error(`[${context}] Error occurred:`, {
        error: sanitizeError(error),
        ...additionalInfo
    });
}

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: any): boolean {
    if (error instanceof AppError) {
        return true;
    }

    // Known operational error types
    const operationalErrors = [
        "ValidationError",
        "UnauthorizedError",
        "ForbiddenError",
        "NotFoundError",
        "ConflictError",
    ];

    return operationalErrors.includes(error?.name);
}
