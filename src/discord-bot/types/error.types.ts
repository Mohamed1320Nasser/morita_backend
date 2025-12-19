/**
 * Discord Error Handling Type Definitions
 *
 * This file contains all error types, status codes, and interfaces
 * used throughout the Discord bot for centralized error handling.
 */

/**
 * Error Types - Categorized by source and nature
 */
export enum ErrorType {
  // ============ Discord API Errors ============
  /** Interaction has expired (typically after 15 minutes) */
  UNKNOWN_INTERACTION = 'UNKNOWN_INTERACTION',

  /** Interaction has already been acknowledged/replied to */
  INTERACTION_ALREADY_ACKNOWLEDGED = 'INTERACTION_ALREADY_ACKNOWLEDGED',

  /** Bot lacks required permissions for the action */
  MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',

  /** Discord rate limit has been hit */
  RATE_LIMITED = 'RATE_LIMITED',

  /** Channel not found or deleted */
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',

  /** User not found or left the server */
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  /** Guild/Server is unavailable */
  GUILD_NOT_FOUND = 'GUILD_NOT_FOUND',

  /** Message not found or deleted */
  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',

  /** Role not found or deleted */
  ROLE_NOT_FOUND = 'ROLE_NOT_FOUND',

  /** Message content exceeds Discord's character limit (2000 chars) */
  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',

  /** Embed exceeds Discord's limits (title: 256, description: 4096, etc.) */
  EMBED_TOO_LONG = 'EMBED_TOO_LONG',

  /** File size exceeds Discord's limit (8MB for non-nitro, 100MB for nitro) */
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  /** Too many embeds in a message (max 10) */
  TOO_MANY_EMBEDS = 'TOO_MANY_EMBEDS',

  /** Too many components in a message (max 5 action rows) */
  TOO_MANY_COMPONENTS = 'TOO_MANY_COMPONENTS',

  /** Invalid embed structure or data */
  INVALID_EMBED = 'INVALID_EMBED',

  /** Cannot send empty message */
  EMPTY_MESSAGE = 'EMPTY_MESSAGE',

  /** Cannot send message in this channel */
  CANNOT_SEND_MESSAGES = 'CANNOT_SEND_MESSAGES',

  /** Missing access to channel */
  MISSING_ACCESS = 'MISSING_ACCESS',

  /** Cannot execute action in DMs */
  CANNOT_USE_IN_DM = 'CANNOT_USE_IN_DM',

  /** Bot is not in the guild */
  BOT_NOT_IN_GUILD = 'BOT_NOT_IN_GUILD',

  /** Invalid form body (validation error from Discord) */
  INVALID_FORM_BODY = 'INVALID_FORM_BODY',

  // ============ Application/Backend Errors ============
  /** Backend API request failed */
  API_REQUEST_FAILED = 'API_REQUEST_FAILED',

  /** Database operation error */
  DATABASE_ERROR = 'DATABASE_ERROR',

  /** Input validation failed */
  VALIDATION_ERROR = 'VALIDATION_ERROR',

  /** Ticket creation failed */
  TICKET_CREATE_FAILED = 'TICKET_CREATE_FAILED',

  /** Order processing error */
  ORDER_PROCESSING_FAILED = 'ORDER_PROCESSING_FAILED',

  /** Wallet operation error */
  WALLET_OPERATION_FAILED = 'WALLET_OPERATION_FAILED',

  /** Pricing data fetch failed */
  PRICING_FETCH_FAILED = 'PRICING_FETCH_FAILED',

  /** Service data fetch failed */
  SERVICE_FETCH_FAILED = 'SERVICE_FETCH_FAILED',

  // ============ Business Logic Errors ============
  /** User has insufficient balance */
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',

  /** Order/job already claimed by another user */
  ORDER_ALREADY_CLAIMED = 'ORDER_ALREADY_CLAIMED',

  /** Ticket is already closed */
  TICKET_ALREADY_CLOSED = 'TICKET_ALREADY_CLOSED',

  /** User lacks required role or permission */
  UNAUTHORIZED_ACTION = 'UNAUTHORIZED_ACTION',

  /** Duplicate order or resource */
  DUPLICATE_ORDER = 'DUPLICATE_ORDER',

  /** Service not found or unavailable */
  INVALID_SERVICE = 'INVALID_SERVICE',

  /** Order not found */
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',

  /** Ticket not found */
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',

  /** User wallet not found */
  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',

  // ============ System Errors ============
  /** Unexpected internal error */
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  /** Operation timeout */
  TIMEOUT = 'TIMEOUT',

  /** Configuration error or missing config */
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  /** Service is down or unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',

  /** Unknown/unclassified error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Error Status Codes - HTTP-like status codes for error categorization
 */
export enum ErrorStatus {
  /** Bad request - client/user error */
  BAD_REQUEST = 400,

  /** Unauthorized - authentication required */
  UNAUTHORIZED = 401,

  /** Forbidden - lacks permission */
  FORBIDDEN = 403,

  /** Resource not found */
  NOT_FOUND = 404,

  /** Conflict - duplicate or state conflict */
  CONFLICT = 409,

  /** Rate limited */
  RATE_LIMITED = 429,

  /** Internal server error */
  INTERNAL_ERROR = 500,

  /** Bad gateway - upstream service error */
  BAD_GATEWAY = 502,

  /** Service unavailable */
  SERVICE_UNAVAILABLE = 503,

  /** Gateway timeout */
  TIMEOUT = 504,
}

/**
 * Error Severity Levels
 */
export enum ErrorSeverity {
  /** Low severity - minor issue, user can continue */
  LOW = 'LOW',

  /** Medium severity - impacts user experience */
  MEDIUM = 'MEDIUM',

  /** High severity - critical functionality broken */
  HIGH = 'HIGH',

  /** Critical - system-wide issue */
  CRITICAL = 'CRITICAL',
}

/**
 * Interaction Context Information
 */
export interface InteractionContext {
  /** Type of interaction (button, command, modal, select menu) */
  type: 'button' | 'command' | 'modal' | 'selectMenu' | 'unknown';

  /** Interaction custom ID or command name */
  identifier: string;

  /** User ID who triggered the interaction */
  userId: string;

  /** Guild/Server ID */
  guildId?: string;

  /** Channel ID */
  channelId?: string;

  /** Additional context data */
  metadata?: Record<string, any>;
}

/**
 * Main Discord Error Interface
 */
export interface DiscordError {
  /** Categorized error type */
  type: ErrorType;

  /** HTTP-like status code */
  status: ErrorStatus;

  /** Internal technical error message (for logs) */
  message: string;

  /** User-friendly message to display in Discord */
  userMessage: string;

  /** Error severity level */
  severity: ErrorSeverity;

  /** Whether this error can be retried */
  retryable: boolean;

  /** Whether to notify the user about this error */
  notifyUser: boolean;

  /** Original error object (if any) */
  originalError?: Error | unknown;

  /** Interaction context information */
  context?: InteractionContext;

  /** Error timestamp */
  timestamp: Date;

  /** Stack trace (if available) */
  stack?: string;

  /** Additional metadata for debugging */
  metadata?: Record<string, any>;
}

/**
 * Error Metadata for Tracking and Analytics
 */
export interface ErrorMetadata {
  /** Error type */
  type: ErrorType;

  /** Status code */
  status: ErrorStatus;

  /** Severity */
  severity: ErrorSeverity;

  /** Error count (for tracking) */
  count?: number;

  /** First occurrence timestamp */
  firstOccurrence: Date;

  /** Last occurrence timestamp */
  lastOccurrence: Date;

  /** Affected users count */
  affectedUsers?: number;

  /** Related interaction types */
  interactionTypes?: string[];
}

/**
 * Error Handler Options
 */
export interface ErrorHandlerOptions {
  /** Whether to send the error to the user via Discord */
  notifyUser?: boolean;

  /** Whether to log the error to Winston/Sentry */
  logError?: boolean;

  /** Whether to include stack trace in logs */
  includeStack?: boolean;

  /** Custom user message (overrides default) */
  customUserMessage?: string;

  /** Additional context to include in logs */
  additionalContext?: Record<string, any>;

  /** Whether this is a recoverable error */
  recoverable?: boolean;
}

/**
 * Error Handler Response
 */
export interface ErrorHandlerResponse {
  /** Whether the error was handled successfully */
  success: boolean;

  /** The classified Discord error */
  error: DiscordError;

  /** Whether user was notified */
  userNotified: boolean;

  /** Whether error was logged */
  logged: boolean;

  /** Any additional response data */
  metadata?: Record<string, any>;
}

/**
 * Discord API Error Codes (from Discord.js)
 */
export enum DiscordAPIError {
  UNKNOWN_INTERACTION = 10062,
  UNKNOWN_CHANNEL = 10003,
  UNKNOWN_GUILD = 10004,
  UNKNOWN_USER = 10013,
  UNKNOWN_MESSAGE = 10008,
  UNKNOWN_ROLE = 10011,
  MISSING_PERMISSIONS = 50013,
  CANNOT_SEND_EMPTY_MESSAGE = 50006,
  CANNOT_SEND_MESSAGES = 50001,
  INTERACTION_ALREADY_ACKNOWLEDGED = 40060,
}

/**
 * Type guard to check if error is a Discord API error
 */
export function isDiscordAPIError(error: any): error is { code: number; message: string } {
  return error && typeof error.code === 'number' && typeof error.message === 'string';
}

/**
 * Type guard to check if error is a DiscordError
 */
export function isDiscordError(error: any): error is DiscordError {
  return error &&
    'type' in error &&
    'status' in error &&
    'message' in error &&
    'userMessage' in error;
}

/**
 * Error Statistics Interface
 */
export interface ErrorStatistics {
  /** Total error count */
  totalErrors: number;

  /** Errors by type */
  byType: Record<ErrorType, number>;

  /** Errors by severity */
  bySeverity: Record<ErrorSeverity, number>;

  /** Errors by status code */
  byStatus: Record<ErrorStatus, number>;

  /** Error rate (errors per minute) */
  errorRate: number;

  /** Time period for statistics */
  period: {
    start: Date;
    end: Date;
  };
}
