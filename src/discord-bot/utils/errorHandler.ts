

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

type AnyInteraction =
  | CommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction
  | BaseInteraction;

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

  if (isDiscordError(error)) {
    discordError = error;
  } else {
    
    discordError = classifyError(error, interaction, additionalContext);
  }

  if (customUserMessage) {
    discordError.userMessage = customUserMessage;
  }

  let userNotified = false;
  let logged = false;

  if (shouldLog) {
    logged = await logError(discordError, includeStack);
  }

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

export function classifyError(
  error: unknown,
  interaction?: AnyInteraction,
  additionalContext?: Record<string, any>
): DiscordError {
  const timestamp = new Date();

  const context = interaction ? extractInteractionContext(interaction) : undefined;

  let errorType = ErrorType.UNKNOWN_ERROR;
  let errorStatus = ErrorStatus.INTERNAL_ERROR;
  let severity = ErrorSeverity.MEDIUM;
  let retryable = true;
  let notifyUser = true;
  let message = 'An unknown error occurred';
  let stack: string | undefined;

  if (isDiscordAPIError(error)) {
    const classification = classifyDiscordAPIError(error.code);
    errorType = classification.type;
    errorStatus = classification.status;
    severity = classification.severity;
    retryable = classification.retryable;
    notifyUser = classification.notifyUser;
    message = error.message || message;
  }
  
  else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;

    if (message.includes('Unknown interaction')) {
      errorType = ErrorType.UNKNOWN_INTERACTION;
      errorStatus = ErrorStatus.NOT_FOUND;
      severity = ErrorSeverity.LOW;
      notifyUser = false; 
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
  
  else if (typeof error === 'string') {
    message = error;
  }

  const userMessage = getUserMessage(errorType);

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

    if (error.context) {
      logData.context = {
        interactionType: error.context.type,
        identifier: error.context.identifier,
        userId: error.context.userId,
        guildId: error.context.guildId,
        channelId: error.context.channelId,
      };
    }

    if (error.metadata) {
      logData.metadata = error.metadata;
    }

    if (includeStack && error.stack) {
      logData.stack = error.stack;
    }

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
    
    logger.error('Failed to log Discord error:', loggingError);
    logger.error('Original error:', error);
    return false;
  }
}

async function notifyUserOfError(interaction: AnyInteraction, error: DiscordError): Promise<boolean> {
  try {
    
    if (!interaction.isRepliable()) {
      return false;
    }

    const replyableInteraction = interaction as
      | CommandInteraction
      | ButtonInteraction
      | ModalSubmitInteraction
      | StringSelectMenuInteraction;

    if (error.type === ErrorType.UNKNOWN_INTERACTION) {
      return false;
    }

    if (replyableInteraction.replied || replyableInteraction.deferred) {
      
      await replyableInteraction.followUp({
        content: error.userMessage,
        ephemeral: true,
      });
    } else {
      
      await replyableInteraction.reply({
        content: error.userMessage,
        ephemeral: true,
      });
    }

    return true;
  } catch (notifyError) {
    
    logger.warn('Failed to notify user about error:', {
      originalError: error.type,
      notifyError: notifyError instanceof Error ? notifyError.message : 'Unknown error',
    });

    return false;
  }
}

export function shouldNotifyUser(errorType: ErrorType): boolean {
  const noNotifyTypes = [
    ErrorType.UNKNOWN_INTERACTION,
    ErrorType.INTERACTION_ALREADY_ACKNOWLEDGED,
  ];

  return !noNotifyTypes.includes(errorType);
}

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

export function isExpiredInteractionError(error: unknown): boolean {
  if (isDiscordAPIError(error) && error.code === DiscordAPIError.UNKNOWN_INTERACTION) {
    return true;
  }

  if (error instanceof Error && error.message.includes('Unknown interaction')) {
    return true;
  }

  return false;
}

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

  return !replyable.replied && !replyable.deferred;
}

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
    
    logger.debug('Failed to send safe reply:', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
