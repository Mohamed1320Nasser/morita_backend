/**
 * Discord Error Messages Configuration
 *
 * User-friendly error messages with suggested actions.
 * These messages are shown to users in Discord while technical details
 * are logged internally.
 *
 * Message Guidelines:
 * - Keep messages concise (1-2 sentences)
 * - Be apologetic but not alarming
 * - Provide actionable next steps
 * - Never expose technical implementation details
 * - Use emojis sparingly
 */

import { ErrorType } from '../types/error.types';

/**
 * Error Message Template Interface
 */
export interface ErrorMessageTemplate {
  /** Main error message */
  message: string;

  /** Suggested action for the user */
  action?: string;

  /** Complete formatted message */
  full: string;
}

/**
 * User-friendly error messages mapped to error types
 */
export const ERROR_MESSAGES: Record<ErrorType, ErrorMessageTemplate> = {
  // ============ Discord API Errors ============
  [ErrorType.UNKNOWN_INTERACTION]: {
    message: 'This interaction has expired.',
    action: 'Please try the command or button again.',
    full: '⚠️ This interaction has expired. Please try the command or button again.',
  },

  [ErrorType.INTERACTION_ALREADY_ACKNOWLEDGED]: {
    message: 'This interaction has already been processed.',
    action: 'If you need to perform this action again, please use the command or button once more.',
    full: '⚠️ This interaction has already been processed. If you need to perform this action again, please use the command or button once more.',
  },

  [ErrorType.MISSING_PERMISSIONS]: {
    message: "The bot doesn't have the required permissions for this action.",
    action: 'Please contact a server administrator to grant the necessary permissions.',
    full: "⚠️ The bot doesn't have the required permissions for this action. Please contact a server administrator to grant the necessary permissions.",
  },

  [ErrorType.RATE_LIMITED]: {
    message: "You're performing actions too quickly.",
    action: 'Please wait a moment and try again.',
    full: "⚠️ You're performing actions too quickly. Please wait a moment and try again.",
  },

  [ErrorType.CHANNEL_NOT_FOUND]: {
    message: 'The channel for this action could not be found.',
    action: 'It may have been deleted. Please contact support if this issue persists.',
    full: '⚠️ The channel for this action could not be found. It may have been deleted. Please contact support if this issue persists.',
  },

  [ErrorType.USER_NOT_FOUND]: {
    message: 'The user could not be found.',
    action: 'They may have left the server. Please try again or contact support.',
    full: '⚠️ The user could not be found. They may have left the server. Please try again or contact support.',
  },

  [ErrorType.GUILD_NOT_FOUND]: {
    message: 'The server is currently unavailable.',
    action: 'Please try again in a few moments.',
    full: '⚠️ The server is currently unavailable. Please try again in a few moments.',
  },

  [ErrorType.MESSAGE_NOT_FOUND]: {
    message: 'The message could not be found.',
    action: 'It may have been deleted. Please refresh and try again.',
    full: '⚠️ The message could not be found. It may have been deleted. Please refresh and try again.',
  },

  [ErrorType.ROLE_NOT_FOUND]: {
    message: 'The required role could not be found.',
    action: 'Please contact a server administrator.',
    full: '⚠️ The required role could not be found. Please contact a server administrator.',
  },

  [ErrorType.MESSAGE_TOO_LONG]: {
    message: 'Your message is too long.',
    action: 'Please shorten your message to 2000 characters or less and try again.',
    full: '⚠️ Your message is too long. Please shorten your message to 2000 characters or less and try again.',
  },

  [ErrorType.EMBED_TOO_LONG]: {
    message: 'The content is too long to display.',
    action: 'Please use shorter text or split the information into multiple messages.',
    full: '⚠️ The content is too long to display. Please use shorter text or split the information into multiple messages.',
  },

  [ErrorType.FILE_TOO_LARGE]: {
    message: 'The file is too large to upload.',
    action: 'Please upload a file smaller than 8MB.',
    full: '⚠️ The file is too large to upload. Please upload a file smaller than 8MB.',
  },

  [ErrorType.TOO_MANY_EMBEDS]: {
    message: 'Too much content to display at once.',
    action: 'Please try again or contact support.',
    full: '⚠️ Too much content to display at once. Please try again or contact support.',
  },

  [ErrorType.TOO_MANY_COMPONENTS]: {
    message: 'Too many buttons or menus in this message.',
    action: 'Please contact support if this issue persists.',
    full: '⚠️ Too many buttons or menus in this message. Please contact support if this issue persists.',
  },

  [ErrorType.INVALID_EMBED]: {
    message: 'The content format is invalid.',
    action: 'Please try again or contact support.',
    full: '⚠️ The content format is invalid. Please try again or contact support.',
  },

  [ErrorType.EMPTY_MESSAGE]: {
    message: 'Cannot send an empty message.',
    action: 'Please provide some content and try again.',
    full: '⚠️ Cannot send an empty message. Please provide some content and try again.',
  },

  [ErrorType.CANNOT_SEND_MESSAGES]: {
    message: 'The bot cannot send messages in this channel.',
    action: 'Please contact a server administrator to grant message permissions.',
    full: '⚠️ The bot cannot send messages in this channel. Please contact a server administrator to grant message permissions.',
  },

  [ErrorType.MISSING_ACCESS]: {
    message: 'The bot cannot access this channel.',
    action: 'Please contact a server administrator to grant access permissions.',
    full: '⚠️ The bot cannot access this channel. Please contact a server administrator to grant access permissions.',
  },

  [ErrorType.CANNOT_USE_IN_DM]: {
    message: 'This command cannot be used in direct messages.',
    action: 'Please use this command in a server channel.',
    full: '⚠️ This command cannot be used in direct messages. Please use this command in a server channel.',
  },

  [ErrorType.BOT_NOT_IN_GUILD]: {
    message: 'The bot is not available in this server.',
    action: 'Please invite the bot to the server or contact an administrator.',
    full: '⚠️ The bot is not available in this server. Please invite the bot to the server or contact an administrator.',
  },

  [ErrorType.INVALID_FORM_BODY]: {
    message: 'The information provided is not valid.',
    action: 'Please check your input and try again.',
    full: '⚠️ The information provided is not valid. Please check your input and try again.',
  },

  // ============ Application/Backend Errors ============
  [ErrorType.API_REQUEST_FAILED]: {
    message: 'Unable to connect to our services right now.',
    action: 'Please try again in a moment. If the issue persists, contact support.',
    full: '⚠️ Unable to connect to our services right now. Please try again in a moment. If the issue persists, contact support.',
  },

  [ErrorType.DATABASE_ERROR]: {
    message: "We're experiencing technical difficulties accessing data.",
    action: 'Please try again shortly. Contact support if the problem continues.',
    full: "⚠️ We're experiencing technical difficulties accessing data. Please try again shortly. Contact support if the problem continues.",
  },

  [ErrorType.VALIDATION_ERROR]: {
    message: 'The information provided is invalid.',
    action: 'Please check your input and try again.',
    full: '⚠️ The information provided is invalid. Please check your input and try again.',
  },

  [ErrorType.TICKET_CREATE_FAILED]: {
    message: 'Unable to create your ticket right now.',
    action: 'Please try again in a moment or contact an administrator.',
    full: '⚠️ Unable to create your ticket right now. Please try again in a moment or contact an administrator.',
  },

  [ErrorType.ORDER_PROCESSING_FAILED]: {
    message: 'We encountered an issue processing your order.',
    action: 'Please try again or contact support for assistance.',
    full: '⚠️ We encountered an issue processing your order. Please try again or contact support for assistance.',
  },

  [ErrorType.WALLET_OPERATION_FAILED]: {
    message: 'Unable to access your wallet at the moment.',
    action: 'Please try again shortly. Contact support if the issue persists.',
    full: '⚠️ Unable to access your wallet at the moment. Please try again shortly. Contact support if the issue persists.',
  },

  [ErrorType.PRICING_FETCH_FAILED]: {
    message: 'Unable to retrieve pricing information right now.',
    action: 'Please try again in a moment.',
    full: '⚠️ Unable to retrieve pricing information right now. Please try again in a moment.',
  },

  [ErrorType.SERVICE_FETCH_FAILED]: {
    message: 'Unable to load service information.',
    action: 'Please try again or use /services to view available services.',
    full: '⚠️ Unable to load service information. Please try again or use /services to view available services.',
  },

  // ============ Business Logic Errors ============
  [ErrorType.INSUFFICIENT_BALANCE]: {
    message: 'You do not have enough balance for this action.',
    action: 'Please add funds to your wallet using /wallet or /add-balance.',
    full: '⚠️ You do not have enough balance for this action. Please add funds to your wallet using /wallet or /add-balance.',
  },

  [ErrorType.ORDER_ALREADY_CLAIMED]: {
    message: 'This order has already been claimed by another worker.',
    action: 'Please check for other available orders.',
    full: '⚠️ This order has already been claimed by another worker. Please check for other available orders.',
  },

  [ErrorType.TICKET_ALREADY_CLOSED]: {
    message: 'This ticket has already been closed.',
    action: 'Create a new ticket if you need further assistance.',
    full: '⚠️ This ticket has already been closed. Create a new ticket if you need further assistance.',
  },

  [ErrorType.UNAUTHORIZED_ACTION]: {
    message: 'You do not have permission to perform this action.',
    action: 'Contact an administrator if you believe this is an error.',
    full: '⚠️ You do not have permission to perform this action. Contact an administrator if you believe this is an error.',
  },

  [ErrorType.DUPLICATE_ORDER]: {
    message: 'You already have an active order for this service.',
    action: 'Please wait for your current order to be completed or cancel it first.',
    full: '⚠️ You already have an active order for this service. Please wait for your current order to be completed or cancel it first.',
  },

  [ErrorType.INVALID_SERVICE]: {
    message: 'The requested service could not be found.',
    action: 'Please use /services to view available services.',
    full: '⚠️ The requested service could not be found. Please use /services to view available services.',
  },

  [ErrorType.ORDER_NOT_FOUND]: {
    message: 'The order could not be found.',
    action: 'It may have been completed or cancelled. Use /order to check your orders.',
    full: '⚠️ The order could not be found. It may have been completed or cancelled. Use /order to check your orders.',
  },

  [ErrorType.TICKET_NOT_FOUND]: {
    message: 'The ticket could not be found.',
    action: 'It may have been closed or deleted.',
    full: '⚠️ The ticket could not be found. It may have been closed or deleted.',
  },

  [ErrorType.WALLET_NOT_FOUND]: {
    message: 'Your wallet could not be found.',
    action: 'Please use /wallet to initialize your wallet.',
    full: '⚠️ Your wallet could not be found. Please use /wallet to initialize your wallet.',
  },

  // ============ System Errors ============
  [ErrorType.INTERNAL_ERROR]: {
    message: 'An unexpected error occurred.',
    action: 'Please try again. If the problem continues, contact support.',
    full: '❌ An unexpected error occurred. Please try again. If the problem continues, contact support.',
  },

  [ErrorType.TIMEOUT]: {
    message: 'The operation took too long to complete.',
    action: 'Please try again. Our services may be experiencing high load.',
    full: '⚠️ The operation took too long to complete. Please try again. Our services may be experiencing high load.',
  },

  [ErrorType.CONFIGURATION_ERROR]: {
    message: 'The bot is not configured correctly.',
    action: 'Please contact a server administrator.',
    full: '❌ The bot is not configured correctly. Please contact a server administrator.',
  },

  [ErrorType.SERVICE_UNAVAILABLE]: {
    message: 'Our services are temporarily unavailable.',
    action: 'Please try again in a few minutes.',
    full: '⚠️ Our services are temporarily unavailable. Please try again in a few minutes.',
  },

  [ErrorType.NETWORK_ERROR]: {
    message: 'A network error occurred.',
    action: 'Please check your connection and try again.',
    full: '⚠️ A network error occurred. Please check your connection and try again.',
  },

  [ErrorType.UNKNOWN_ERROR]: {
    message: 'An unknown error occurred.',
    action: 'Please try again or contact support if this continues.',
    full: '❌ An unknown error occurred. Please try again or contact support if this continues.',
  },
};

/**
 * Default fallback message when error type is not mapped
 */
export const DEFAULT_ERROR_MESSAGE: ErrorMessageTemplate = {
  message: 'Something went wrong.',
  action: 'Please try again later or contact support.',
  full: '❌ Something went wrong. Please try again later or contact support.',
};

/**
 * Get user-friendly error message for a given error type
 *
 * @param errorType - The error type
 * @param includeAction - Whether to include the suggested action (default: true)
 * @param variables - Variables to replace in the message (e.g., {serviceName})
 * @returns Formatted user-friendly error message
 */
export function getUserMessage(
  errorType: ErrorType,
  includeAction: boolean = true,
  variables?: Record<string, string>
): string {
  const template = ERROR_MESSAGES[errorType] || DEFAULT_ERROR_MESSAGE;

  let message = includeAction ? template.full : template.message;

  // Replace variables if provided
  if (variables) {
    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), value);
    });
  }

  return message;
}

/**
 * Get just the action suggestion for an error type
 *
 * @param errorType - The error type
 * @returns Suggested action or undefined
 */
export function getActionSuggestion(errorType: ErrorType): string | undefined {
  const template = ERROR_MESSAGES[errorType] || DEFAULT_ERROR_MESSAGE;
  return template.action;
}

/**
 * Support contact information
 */
export const SUPPORT_INFO = {
  message: '\n\n📧 Need help? Contact our support team or create a ticket.',
  ticketCommand: '/ticket',
  supportRole: 'Support',
};

/**
 * Get error message with support info appended
 *
 * @param errorType - The error type
 * @param includeSupportInfo - Whether to append support information
 * @returns Error message with optional support info
 */
export function getMessageWithSupport(
  errorType: ErrorType,
  includeSupportInfo: boolean = false
): string {
  const message = getUserMessage(errorType);

  if (includeSupportInfo) {
    return message + SUPPORT_INFO.message;
  }

  return message;
}

/**
 * Custom error message builder for dynamic errors
 *
 * @param baseMessage - Base error message
 * @param action - Suggested action
 * @param emoji - Emoji to prepend (default: ⚠️)
 * @returns Formatted error message
 */
export function buildCustomErrorMessage(
  baseMessage: string,
  action?: string,
  emoji: string = '⚠️'
): string {
  let message = `${emoji} ${baseMessage}`;

  if (action) {
    message += ` ${action}`;
  }

  return message;
}
