/**
 * Discord Error Handler Utility
 *
 * Centralized error handling for Discord bot interactions.
 * Provides classification, logging, user notification, and error tracking.
 *
 * Main functions:
 * - handleInteractionError: Main entry point for handling interaction errors
 * - classifyError: Classify unknown errors into DiscordError types
 * - logError: Log errors to Winston and Sentry
 * - notifyUser: Send user-friendly error messages via Discord
 */

import {
  ButtonInteraction,
  CommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  BaseInteraction,
  RESTJSONErrorCodes,
} from 'discord.js';
import logger from '../../common/loggers';
import { splitText, DISCORD_LIMITS } from './messageSplitter';
import {
  ErrorType,
  ErrorStatus,
  ErrorSeverity,
  DiscordError,
  InteractionContext,
  ErrorHandlerOptions,
  ErrorHandlerResponse,
  DiscordAPIError,
  isDiscordAPIError,
  isDiscordError,
} from '../types/error.types';
import {
  getUserMessage,
  DEFAULT_ERROR_MESSAGE,
  buildCustomErrorMessage,
} from '../config/errorMessages.config';

/**
 * Type alias for all interaction types
 */
type AnyInteraction =
  | CommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction
  | BaseInteraction;

/**
 * Main error handler for Discord interactions
 *
 * This is the primary function to use when catching errors in interaction handlers.
 * It will:
 * 1. Classify the error
 * 2. Log it to Winston/Sentry
 * 3. Notify the user (if appropriate)
 * 4. Return error metadata
 *
 * @param error - The caught error
 * @param interaction - The Discord interaction that caused the error
 * @param options - Optional configuration for error handling
 * @returns ErrorHandlerResponse with handling status and metadata
 *
 * @example
 * ```typescript
 * try {
 *   await someOperation();
 * } catch (error) {
 *   await handleInteractionError(error, interaction);
 * }
 * ```
 */
export async function handleInteractionError(
  error: unknown,
  interaction: AnyInteraction,
  options: ErrorHandlerOptions = {}
): Promise<ErrorHandlerResponse> {
  const {
    notifyUser = true,
    logError: shouldLog = true,
    includeStack = true,
    customUserMessage,
    additionalContext,
    recoverable = false,
  } = options;

  let discordError: DiscordError;

  // If already a DiscordError, use it directly
  if (isDiscordError(error)) {
    discordError = error;
  } else {
    // Classify the error
    discordError = classifyError(error, interaction, additionalContext);
  }

  // Override user message if provided
  if (customUserMessage) {
    discordError.userMessage = customUserMessage;
  }

  let userNotified = false;
  let logged = false;

  // Log the error (unless disabled)
  if (shouldLog) {
    logged = await logError(discordError, includeStack);
  }

  // Notify user (unless disabled or error shouldn't be shown)
  if (notifyUser && discordError.notifyUser && shouldNotifyUser(discordError.type)) {
    userNotified = await notifyUserOfError(interaction, discordError);
  }

  return {
    success: true,
    error: discordError,
    userNotified,
    logged,
    metadata: {
      recoverable,
      retryable: discordError.retryable,
    },
  };
}

/**
 * Classify an unknown error into a DiscordError
 *
 * Examines the error and determines:
 * - Error type (from ErrorType enum)
 * - Status code
 * - Severity
 * - Whether it's retryable
 * - User-friendly message
 *
 * @param error - The error to classify
 * @param interaction - Optional interaction context
 * @param additionalContext - Additional context data
 * @returns Classified DiscordError
 */
export function classifyError(
  error: unknown,
  interaction?: AnyInteraction,
  additionalContext?: Record<string, any>
): DiscordError {
  const timestamp = new Date();

  // Extract interaction context
  const context = interaction ? extractInteractionContext(interaction) : undefined;

  // Default error structure
  let errorType = ErrorType.UNKNOWN_ERROR;
  let errorStatus = ErrorStatus.INTERNAL_ERROR;
  let severity = ErrorSeverity.MEDIUM;
  let retryable = true;
  let notifyUser = true;
  let message = 'An unknown error occurred';
  let stack: string | undefined;

  // Handle Discord API errors
  if (isDiscordAPIError(error)) {
    const classification = classifyDiscordAPIError(error.code);
    errorType = classification.type;
    errorStatus = classification.status;
    severity = classification.severity;
    retryable = classification.retryable;
    notifyUser = classification.notifyUser;
    message = error.message || message;
  }
  // Handle standard Error objects
  else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;

    // Check for specific error patterns in message
    if (message.includes('Unknown interaction')) {
      errorType = ErrorType.UNKNOWN_INTERACTION;
      errorStatus = ErrorStatus.NOT_FOUND;
      severity = ErrorSeverity.LOW;
      notifyUser = false; // Don't notify for expired interactions
      retryable = false;
    } else if (message.includes('already acknowledged') || message.includes('already been acknowledged')) {
      errorType = ErrorType.INTERACTION_ALREADY_ACKNOWLEDGED;
      errorStatus = ErrorStatus.CONFLICT;
      severity = ErrorSeverity.LOW;
      notifyUser = false;
      retryable = false;
    } else if (message.toLowerCase().includes('permission')) {
      errorType = ErrorType.MISSING_PERMISSIONS;
      errorStatus = ErrorStatus.FORBIDDEN;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    } else if (message.toLowerCase().includes('rate limit')) {
      errorType = ErrorType.RATE_LIMITED;
      errorStatus = ErrorStatus.RATE_LIMITED;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (message.toLowerCase().includes('timeout')) {
      errorType = ErrorType.TIMEOUT;
      errorStatus = ErrorStatus.TIMEOUT;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (message.toLowerCase().includes('network') || message.toLowerCase().includes('econnrefused')) {
      errorType = ErrorType.NETWORK_ERROR;
      errorStatus = ErrorStatus.BAD_GATEWAY;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    } else if (message.toLowerCase().includes('validation')) {
      errorType = ErrorType.VALIDATION_ERROR;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('database') || message.toLowerCase().includes('prisma')) {
      errorType = ErrorType.DATABASE_ERROR;
      errorStatus = ErrorStatus.INTERNAL_ERROR;
      severity = ErrorSeverity.HIGH;
      retryable = true;
    } else if (message.toLowerCase().includes('insufficient balance')) {
      errorType = ErrorType.INSUFFICIENT_BALANCE;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('unauthorized') || message.toLowerCase().includes('forbidden')) {
      errorType = ErrorType.UNAUTHORIZED_ACTION;
      errorStatus = ErrorStatus.FORBIDDEN;
      severity = ErrorSeverity.MEDIUM;
      retryable = false;
    } else if (message.toLowerCase().includes('message is too long') || message.toLowerCase().includes('2000 characters')) {
      errorType = ErrorType.MESSAGE_TOO_LONG;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('embed') && (message.toLowerCase().includes('too long') || message.toLowerCase().includes('4096'))) {
      errorType = ErrorType.EMBED_TOO_LONG;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('file') && message.toLowerCase().includes('too large')) {
      errorType = ErrorType.FILE_TOO_LARGE;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('too many embeds')) {
      errorType = ErrorType.TOO_MANY_EMBEDS;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('too many components') || message.toLowerCase().includes('too many action rows')) {
      errorType = ErrorType.TOO_MANY_COMPONENTS;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('cannot send empty message')) {
      errorType = ErrorType.EMPTY_MESSAGE;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('cannot send message') || message.toLowerCase().includes('missing access')) {
      errorType = ErrorType.CANNOT_SEND_MESSAGES;
      errorStatus = ErrorStatus.FORBIDDEN;
      severity = ErrorSeverity.HIGH;
      retryable = false;
    } else if (message.toLowerCase().includes('cannot be used in dm') || message.toLowerCase().includes('not available in dm')) {
      errorType = ErrorType.CANNOT_USE_IN_DM;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else if (message.toLowerCase().includes('invalid form body')) {
      errorType = ErrorType.INVALID_FORM_BODY;
      errorStatus = ErrorStatus.BAD_REQUEST;
      severity = ErrorSeverity.LOW;
      retryable = false;
    } else {
      errorType = ErrorType.INTERNAL_ERROR;
      errorStatus = ErrorStatus.INTERNAL_ERROR;
      severity = ErrorSeverity.MEDIUM;
      retryable = true;
    }
  }
  // Handle string errors
  else if (typeof error === 'string') {
    message = error;
  }

  // Get user-friendly message
  const userMessage = getUserMessage(errorType);

  // Build DiscordError
  const discordError: DiscordError = {
    type: errorType,
    status: errorStatus,
    message,
    userMessage,
    severity,
    retryable,
    notifyUser,
    originalError: error,
    context,
    timestamp,
    stack,
    metadata: additionalContext,
  };

  return discordError;
}

/**
 * Classify Discord API error codes into error types
 *
 * @param code - Discord API error code
 * @returns Error classification
 */
function classifyDiscordAPIError(code: number): {
  type: ErrorType;
  status: ErrorStatus;
  severity: ErrorSeverity;
  retryable: boolean;
  notifyUser: boolean;
} {
  switch (code) {
    case DiscordAPIError.UNKNOWN_INTERACTION:
    case RESTJSONErrorCodes.UnknownInteraction:
      return {
        type: ErrorType.UNKNOWN_INTERACTION,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.LOW,
        retryable: false,
        notifyUser: false,
      };

    case DiscordAPIError.INTERACTION_ALREADY_ACKNOWLEDGED:
      return {
        type: ErrorType.INTERACTION_ALREADY_ACKNOWLEDGED,
        status: ErrorStatus.CONFLICT,
        severity: ErrorSeverity.LOW,
        retryable: false,
        notifyUser: false,
      };

    case DiscordAPIError.UNKNOWN_CHANNEL:
    case RESTJSONErrorCodes.UnknownChannel:
      return {
        type: ErrorType.CHANNEL_NOT_FOUND,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.UNKNOWN_GUILD:
    case RESTJSONErrorCodes.UnknownGuild:
      return {
        type: ErrorType.GUILD_NOT_FOUND,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.UNKNOWN_USER:
    case RESTJSONErrorCodes.UnknownUser:
      return {
        type: ErrorType.USER_NOT_FOUND,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.UNKNOWN_MESSAGE:
    case RESTJSONErrorCodes.UnknownMessage:
      return {
        type: ErrorType.MESSAGE_NOT_FOUND,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.LOW,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.UNKNOWN_ROLE:
    case RESTJSONErrorCodes.UnknownRole:
      return {
        type: ErrorType.ROLE_NOT_FOUND,
        status: ErrorStatus.NOT_FOUND,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.MISSING_PERMISSIONS:
    case RESTJSONErrorCodes.MissingPermissions:
      return {
        type: ErrorType.MISSING_PERMISSIONS,
        status: ErrorStatus.FORBIDDEN,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.CANNOT_SEND_EMPTY_MESSAGE:
    case RESTJSONErrorCodes.CannotSendAnEmptyMessage:
      return {
        type: ErrorType.EMPTY_MESSAGE,
        status: ErrorStatus.BAD_REQUEST,
        severity: ErrorSeverity.LOW,
        retryable: false,
        notifyUser: true,
      };

    case DiscordAPIError.CANNOT_SEND_MESSAGES:
    case RESTJSONErrorCodes.MissingAccess:
      return {
        type: ErrorType.CANNOT_SEND_MESSAGES,
        status: ErrorStatus.FORBIDDEN,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        notifyUser: true,
      };

    default:
      return {
        type: ErrorType.UNKNOWN_ERROR,
        status: ErrorStatus.INTERNAL_ERROR,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        notifyUser: true,
      };
  }
}

/**
 * Log error to Winston and Sentry
 *
 * @param error - DiscordError to log
 * @param includeStack - Whether to include stack trace
 * @returns true if logged successfully
 */
export async function logError(error: DiscordError, includeStack: boolean = true): Promise<boolean> {
  try {
    const logData: any = {
      errorType: error.type,
      status: error.status,
      severity: error.severity,
      message: error.message,
      retryable: error.retryable,
      timestamp: error.timestamp,
    };

    // Add context if available
    if (error.context) {
      logData.context = {
        interactionType: error.context.type,
        identifier: error.context.identifier,
        userId: error.context.userId,
        guildId: error.context.guildId,
        channelId: error.context.channelId,
      };
    }

    // Add metadata if available
    if (error.metadata) {
      logData.metadata = error.metadata;
    }

    // Add stack if available and requested
    if (includeStack && error.stack) {
      logData.stack = error.stack;
    }

    // Log based on severity
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        logger.error('Discord Error (High/Critical):', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Discord Error (Medium):', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Discord Error (Low):', logData);
        break;
      default:
        logger.error('Discord Error:', logData);
    }

    return true;
  } catch (loggingError) {
    // Fallback if logging fails
    console.error('Failed to log Discord error:', loggingError);
    console.error('Original error:', error);
    return false;
  }
}

/**
 * Notify user about the error via Discord
 *
 * Attempts to send an ephemeral message to the user.
 * Handles cases where interaction is already replied/deferred.
 *
 * @param interaction - The Discord interaction
 * @param error - The DiscordError
 * @returns true if user was notified successfully
 */
async function notifyUserOfError(interaction: AnyInteraction, error: DiscordError): Promise<boolean> {
  try {
    // Check if interaction can be replied to
    if (!interaction.isRepliable()) {
      return false;
    }

    const replyableInteraction = interaction as
      | CommandInteraction
      | ButtonInteraction
      | ModalSubmitInteraction
      | StringSelectMenuInteraction;

    // Don't notify for expired interactions
    if (error.type === ErrorType.UNKNOWN_INTERACTION) {
      return false;
    }

    // Determine reply method based on interaction state
    if (replyableInteraction.replied || replyableInteraction.deferred) {
      // Use followUp if already replied/deferred
      await replyableInteraction.followUp({
        content: error.userMessage,
        ephemeral: true,
      });
    } else {
      // Use reply if not yet replied
      await replyableInteraction.reply({
        content: error.userMessage,
        ephemeral: true,
      });
    }

    return true;
  } catch (notifyError) {
    // Failed to notify user - log this but don't throw
    logger.warn('Failed to notify user about error:', {
      originalError: error.type,
      notifyError: notifyError instanceof Error ? notifyError.message : 'Unknown error',
    });

    return false;
  }
}

/**
 * Determine if user should be notified about this error type
 *
 * Some errors don't warrant user notification (e.g., expired interactions)
 *
 * @param errorType - The error type
 * @returns true if user should be notified
 */
export function shouldNotifyUser(errorType: ErrorType): boolean {
  const noNotifyTypes = [
    ErrorType.UNKNOWN_INTERACTION,
    ErrorType.INTERACTION_ALREADY_ACKNOWLEDGED,
  ];

  return !noNotifyTypes.includes(errorType);
}

/**
 * Determine if error is retryable
 *
 * @param errorType - The error type
 * @returns true if error can be retried
 */
export function isRetryableError(errorType: ErrorType): boolean {
  const retryableTypes = [
    ErrorType.RATE_LIMITED,
    ErrorType.TIMEOUT,
    ErrorType.API_REQUEST_FAILED,
    ErrorType.DATABASE_ERROR,
    ErrorType.SERVICE_UNAVAILABLE,
    ErrorType.NETWORK_ERROR,
    ErrorType.PRICING_FETCH_FAILED,
    ErrorType.SERVICE_FETCH_FAILED,
    ErrorType.WALLET_OPERATION_FAILED,
  ];

  return retryableTypes.includes(errorType);
}

/**
 * Extract interaction context for logging
 *
 * @param interaction - The Discord interaction
 * @returns InteractionContext
 */
function extractInteractionContext(interaction: AnyInteraction): InteractionContext {
  let type: InteractionContext['type'] = 'unknown';
  let identifier = 'unknown';

  if (interaction.isCommand()) {
    type = 'command';
    identifier = interaction.commandName;
  } else if (interaction.isButton()) {
    type = 'button';
    identifier = interaction.customId;
  } else if (interaction.isModalSubmit()) {
    type = 'modal';
    identifier = interaction.customId;
  } else if (interaction.isStringSelectMenu()) {
    type = 'selectMenu';
    identifier = interaction.customId;
  }

  return {
    type,
    identifier,
    userId: interaction.user.id,
    guildId: interaction.guildId || undefined,
    channelId: interaction.channelId || undefined,
  };
}

/**
 * Create a custom DiscordError manually
 *
 * Useful when you want to throw a specific error type
 *
 * @param type - Error type
 * @param message - Internal error message
 * @param options - Additional options
 * @returns DiscordError
 *
 * @example
 * ```typescript
 * if (balance < amount) {
 *   throw createDiscordError(
 *     ErrorType.INSUFFICIENT_BALANCE,
 *     `User ${userId} has insufficient balance`,
 *     { userId, balance, required: amount }
 *   );
 * }
 * ```
 */
export function createDiscordError(
  type: ErrorType,
  message: string,
  options: {
    status?: ErrorStatus;
    severity?: ErrorSeverity;
    metadata?: Record<string, any>;
    customUserMessage?: string;
  } = {}
): DiscordError {
  const userMessage = options.customUserMessage || getUserMessage(type);

  // Determine defaults based on type
  let status = options.status || ErrorStatus.INTERNAL_ERROR;
  let severity = options.severity || ErrorSeverity.MEDIUM;
  let retryable = isRetryableError(type);

  return {
    type,
    status,
    message,
    userMessage,
    severity,
    retryable,
    notifyUser: shouldNotifyUser(type),
    timestamp: new Date(),
    metadata: options.metadata,
  };
}

/**
 * Check if an error is a Discord "Unknown Interaction" error
 *
 * @param error - Error to check
 * @returns true if error is an expired interaction error
 */
export function isExpiredInteractionError(error: unknown): boolean {
  if (isDiscordAPIError(error) && error.code === DiscordAPIError.UNKNOWN_INTERACTION) {
    return true;
  }

  if (error instanceof Error && error.message.includes('Unknown interaction')) {
    return true;
  }

  return false;
}

/**
 * Check if interaction is safe to reply to
 *
 * Verifies that the interaction hasn't expired and hasn't been replied to yet
 *
 * @param interaction - The interaction to check
 * @returns true if safe to reply
 */
export function canReplyToInteraction(
  interaction: AnyInteraction
): interaction is CommandInteraction | ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction {
  if (!interaction.isRepliable()) {
    return false;
  }

  const replyable = interaction as
    | CommandInteraction
    | ButtonInteraction
    | ModalSubmitInteraction
    | StringSelectMenuInteraction;

  // Check if not replied and not deferred
  return !replyable.replied && !replyable.deferred;
}

/**
 * Safely reply to interaction with error handling
 *
 * Attempts to reply, handling all error cases gracefully
 *
 * @param interaction - The interaction to reply to
 * @param content - Message content
 * @param ephemeral - Whether message should be ephemeral (default: true)
 * @returns true if reply was successful
 */
export async function safeReply(
  interaction: AnyInteraction,
  content: string,
  ephemeral: boolean = true
): Promise<boolean> {
  try {
    if (!interaction.isRepliable()) {
      return false;
    }

    const replyable = interaction as
      | CommandInteraction
      | ButtonInteraction
      | ModalSubmitInteraction
      | StringSelectMenuInteraction;

    if (canReplyToInteraction(interaction)) {
      await replyable.reply({ content, ephemeral });
    } else if (replyable.replied || replyable.deferred) {
      await replyable.followUp({ content, ephemeral });
    } else {
      return false;
    }

    return true;
  } catch (error) {
    // Don't throw - just log and return false
    logger.debug('Failed to send safe reply:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
