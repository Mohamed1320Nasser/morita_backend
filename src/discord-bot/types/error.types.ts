

export enum ErrorType {

  UNKNOWN_INTERACTION = 'UNKNOWN_INTERACTION',

  INTERACTION_ALREADY_ACKNOWLEDGED = 'INTERACTION_ALREADY_ACKNOWLEDGED',

  MISSING_PERMISSIONS = 'MISSING_PERMISSIONS',

  RATE_LIMITED = 'RATE_LIMITED',

  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',

  USER_NOT_FOUND = 'USER_NOT_FOUND',

  GUILD_NOT_FOUND = 'GUILD_NOT_FOUND',

  MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND',

  ROLE_NOT_FOUND = 'ROLE_NOT_FOUND',

  MESSAGE_TOO_LONG = 'MESSAGE_TOO_LONG',

  EMBED_TOO_LONG = 'EMBED_TOO_LONG',

  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  TOO_MANY_EMBEDS = 'TOO_MANY_EMBEDS',

  TOO_MANY_COMPONENTS = 'TOO_MANY_COMPONENTS',

  INVALID_EMBED = 'INVALID_EMBED',

  EMPTY_MESSAGE = 'EMPTY_MESSAGE',

  CANNOT_SEND_MESSAGES = 'CANNOT_SEND_MESSAGES',

  MISSING_ACCESS = 'MISSING_ACCESS',

  CANNOT_USE_IN_DM = 'CANNOT_USE_IN_DM',

  BOT_NOT_IN_GUILD = 'BOT_NOT_IN_GUILD',

  INVALID_FORM_BODY = 'INVALID_FORM_BODY',

  API_REQUEST_FAILED = 'API_REQUEST_FAILED',

  DATABASE_ERROR = 'DATABASE_ERROR',

  VALIDATION_ERROR = 'VALIDATION_ERROR',

  TICKET_CREATE_FAILED = 'TICKET_CREATE_FAILED',

  ORDER_PROCESSING_FAILED = 'ORDER_PROCESSING_FAILED',

  WALLET_OPERATION_FAILED = 'WALLET_OPERATION_FAILED',

  PRICING_FETCH_FAILED = 'PRICING_FETCH_FAILED',

  SERVICE_FETCH_FAILED = 'SERVICE_FETCH_FAILED',

  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',

  ORDER_ALREADY_CLAIMED = 'ORDER_ALREADY_CLAIMED',

  TICKET_ALREADY_CLOSED = 'TICKET_ALREADY_CLOSED',

  UNAUTHORIZED_ACTION = 'UNAUTHORIZED_ACTION',

  DUPLICATE_ORDER = 'DUPLICATE_ORDER',

  INVALID_SERVICE = 'INVALID_SERVICE',

  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',

  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',

  WALLET_NOT_FOUND = 'WALLET_NOT_FOUND',

  INTERNAL_ERROR = 'INTERNAL_ERROR',

  TIMEOUT = 'TIMEOUT',

  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',

  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  NETWORK_ERROR = 'NETWORK_ERROR',

  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorStatus {
  
  BAD_REQUEST = 400,

  UNAUTHORIZED = 401,

  FORBIDDEN = 403,

  NOT_FOUND = 404,

  CONFLICT = 409,

  RATE_LIMITED = 429,

  INTERNAL_ERROR = 500,

  BAD_GATEWAY = 502,

  SERVICE_UNAVAILABLE = 503,

  TIMEOUT = 504,
}

export enum ErrorSeverity {
  
  LOW = 'LOW',

  MEDIUM = 'MEDIUM',

  HIGH = 'HIGH',

  CRITICAL = 'CRITICAL',
}

export interface InteractionContext {
  
  type: 'button' | 'command' | 'modal' | 'selectMenu' | 'unknown';

  identifier: string;

  userId: string;

  guildId?: string;

  channelId?: string;

  metadata?: Record<string, any>;
}

export interface DiscordError {
  
  type: ErrorType;

  status: ErrorStatus;

  message: string;

  userMessage: string;

  severity: ErrorSeverity;

  retryable: boolean;

  notifyUser: boolean;

  originalError?: Error | unknown;

  context?: InteractionContext;

  timestamp: Date;

  stack?: string;

  metadata?: Record<string, any>;
}

export interface ErrorMetadata {
  
  type: ErrorType;

  status: ErrorStatus;

  severity: ErrorSeverity;

  count?: number;

  firstOccurrence: Date;

  lastOccurrence: Date;

  affectedUsers?: number;

  interactionTypes?: string[];
}

export interface ErrorHandlerOptions {
  
  notifyUser?: boolean;

  logError?: boolean;

  includeStack?: boolean;

  customUserMessage?: string;

  additionalContext?: Record<string, any>;

  recoverable?: boolean;
}

export interface ErrorHandlerResponse {
  
  success: boolean;

  error: DiscordError;

  userNotified: boolean;

  logged: boolean;

  metadata?: Record<string, any>;
}

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

export function isDiscordAPIError(error: any): error is { code: number; message: string } {
  return error && typeof error.code === 'number' && typeof error.message === 'string';
}

export function isDiscordError(error: any): error is DiscordError {
  return error &&
    'type' in error &&
    'status' in error &&
    'message' in error &&
    'userMessage' in error;
}

export interface ErrorStatistics {
  
  totalErrors: number;

  byType: Record<ErrorType, number>;

  bySeverity: Record<ErrorSeverity, number>;

  byStatus: Record<ErrorStatus, number>;

  errorRate: number;

  period: {
    start: Date;
    end: Date;
  };
}
