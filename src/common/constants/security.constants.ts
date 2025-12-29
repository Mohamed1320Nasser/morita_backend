/**
 * Security and Business Logic Constants
 * Centralized constants to avoid magic numbers and improve maintainability
 */

// Financial Limits
export const FINANCIAL_LIMITS = {
    MIN_ORDER_VALUE: 0.01,
    MAX_ORDER_VALUE: 100000, // $100,000 maximum order
    MIN_DEPOSIT: 0,
    MAX_DEPOSIT: 100000,
    MIN_WALLET_BALANCE: 0,
    MAX_WALLET_BALANCE: 1000000, // $1M maximum wallet balance
    MIN_TRANSACTION_AMOUNT: 0.01,
    MAX_TRANSACTION_AMOUNT: 100000,
} as const;

// Payout Percentages (must sum to 1.0)
export const PAYOUT_STRUCTURE = {
    WORKER_PERCENTAGE: 0.8, // 80%
    SUPPORT_PERCENTAGE: 0.05, // 5%
    SYSTEM_PERCENTAGE: 0.15, // 15%
} as const;

// Validation: Ensure percentages sum to 100%
const totalPercentage = Object.values(PAYOUT_STRUCTURE).reduce((a, b) => a + b, 0);
if (Math.abs(totalPercentage - 1.0) > 0.001) {
    throw new Error(`Payout percentages must sum to 1.0, got ${totalPercentage}`);
}

// Cache TTLs (Time To Live)
export const CACHE_TTL = {
    ORDER_DATA_TTL_MS: 30 * 60 * 1000, // 30 minutes (increased from 10 min to handle bot restarts)
    IDEMPOTENCY_KEY_TTL_SECONDS: 24 * 60 * 60, // 24 hours
    SESSION_TTL_MS: 30 * 60 * 1000, // 30 minutes
    TICKET_SETTINGS_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// Discord Limits
export const DISCORD_LIMITS = {
    EMBED_TITLE_MAX_LENGTH: 256,
    EMBED_DESCRIPTION_MAX_LENGTH: 4096,
    EMBED_FIELD_NAME_MAX_LENGTH: 256,
    EMBED_FIELD_VALUE_MAX_LENGTH: 1024,
    EMBED_FOOTER_MAX_LENGTH: 2048,
    EMBED_AUTHOR_NAME_MAX_LENGTH: 256,
    EMBED_TOTAL_CHARACTERS: 6000,
    MODAL_TITLE_MAX_LENGTH: 45,
    MODAL_LABEL_MAX_LENGTH: 45,
    MODAL_PLACEHOLDER_MAX_LENGTH: 100,
    MODAL_INPUT_MAX_LENGTH: 4000,
    MODAL_MAX_COMPONENTS: 5,
    MESSAGE_CONTENT_MAX_LENGTH: 2000,
} as const;

// Input Validation Patterns
export const VALIDATION_PATTERNS = {
    // Alphanumeric with basic punctuation
    SAFE_TEXT: /^[a-zA-Z0-9\s\-.,!?@#$%&()\[\]{}'"\/\\:;+=*<>|~`^_]*$/,
    // Username (alphanumeric, underscore, hyphen)
    USERNAME: /^[a-zA-Z0-9_-]+$/,
    // Discord ID (numeric only)
    DISCORD_ID: /^\d{17,19}$/,
    // Crypto wallet address (hex with 0x prefix)
    CRYPTO_WALLET: /^0x[a-fA-F0-9]{40}$/,
    // UUID v4
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

// Rate Limiting
export const RATE_LIMITS = {
    ORDERS_PER_MINUTE: 5,
    WALLET_OPERATIONS_PER_MINUTE: 10,
    TICKETS_PER_HOUR: 3,
    API_CALLS_PER_MINUTE: 60,
    MAX_CONCURRENT_ORDERS_PER_USER: 5,
} as const;

// Transaction Isolation
export const TRANSACTION_CONFIG = {
    MAX_WAIT_MS: 5000, // 5 seconds
    TIMEOUT_MS: 10000, // 10 seconds
    ISOLATION_LEVEL: 'Serializable', // Strongest isolation
} as const;

// Ticket Settings
export const TICKET_CONFIG = {
    AUTO_CLOSE_HOURS: 24,
    MAX_OPEN_TICKETS_PER_USER: 5,
    CHANNEL_PREFIX: 'ticket-',
    LOG_RETENTION_DAYS: 90,
} as const;

// Order Settings
export const ORDER_CONFIG = {
    MAX_JOB_DETAILS_LENGTH: 2000,
    MAX_COMPLETION_NOTES_LENGTH: 1000,
    MAX_CANCELLATION_REASON_LENGTH: 500,
    DISPUTE_TIMEOUT_HOURS: 72,
} as const;

// Security Settings
export const SECURITY_CONFIG = {
    API_KEY_MIN_LENGTH: 32,
    SESSION_SECRET_MIN_LENGTH: 64,
    BCRYPT_ROUNDS: 12,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 30,
} as const;

// Export validation helper
export const isValidAmount = (amount: number, min: number = FINANCIAL_LIMITS.MIN_TRANSACTION_AMOUNT, max: number = FINANCIAL_LIMITS.MAX_TRANSACTION_AMOUNT): boolean => {
    return typeof amount === 'number' && !isNaN(amount) && amount >= min && amount <= max;
};

export const isValidDiscordId = (id: string): boolean => {
    return VALIDATION_PATTERNS.DISCORD_ID.test(id);
};

export const isValidUUID = (id: string): boolean => {
    return VALIDATION_PATTERNS.UUID.test(id);
};
