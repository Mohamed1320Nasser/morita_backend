/**
 * Standardized API Response Utilities
 * Ensures consistent response format across all endpoints
 */

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: any;
    };
    metadata?: {
        timestamp: string;
        requestId?: string;
        pagination?: PaginationMetadata;
    };
}

export interface PaginationMetadata {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}

/**
 * Create a successful API response
 */
export function successResponse<T>(data: T, metadata?: Partial<ApiResponse["metadata"]>): ApiResponse<T> {
    return {
        success: true,
        data,
        metadata: {
            timestamp: new Date().toISOString(),
            ...metadata
        }
    };
}

/**
 * Create a paginated success response
 */
export function paginatedResponse<T>(
    data: T[],
    pagination: { page: number; limit: number; total: number }
): ApiResponse<T[]> {
    const totalPages = Math.ceil(pagination.total / pagination.limit);

    return {
        success: true,
        data,
        metadata: {
            timestamp: new Date().toISOString(),
            pagination: {
                ...pagination,
                totalPages,
                hasNext: pagination.page < totalPages,
                hasPrevious: pagination.page > 1
            }
        }
    };
}

/**
 * Create an error API response
 */
export function errorResponse(
    code: string,
    message: string,
    details?: any,
    requestId?: string
): ApiResponse {
    return {
        success: false,
        error: {
            code,
            message,
            ...(details && { details })
        },
        metadata: {
            timestamp: new Date().toISOString(),
            ...(requestId && { requestId })
        }
    };
}

/**
 * Unwrap nested API responses (fixes the triple-nesting issue)
 */
export function unwrapResponse<T>(response: any): T {
    // Handle triple-nested responses: { data: { data: { data: actualData } } }
    let current = response;

    // Unwrap up to 3 levels of nesting
    for (let i = 0; i < 3; i++) {
        if (current?.data !== undefined) {
            current = current.data;
        } else {
            break;
        }
    }

    return current as T;
}

/**
 * Sanitize data before sending (remove sensitive fields)
 */
export function sanitizeResponse<T>(data: T, sensitiveFields: string[] = []): T {
    if (!data || typeof data !== "object") {
        return data;
    }

    const defaultSensitiveFields = [
        "password",
        "passwordHash",
        "apiKey",
        "apiToken",
        "secret",
        "privateKey",
        "accessToken",
        "refreshToken",
    ];

    const fieldsToRemove = [...defaultSensitiveFields, ...sensitiveFields];

    const sanitized = { ...data };

    fieldsToRemove.forEach(field => {
        if (field in sanitized) {
            delete (sanitized as any)[field];
        }
    });

    return sanitized;
}

/**
 * Create a minimal response for Discord bot (less verbose)
 */
export function discordResponse<T>(data: T): { success: boolean; data: T } {
    return {
        success: true,
        data
    };
}

/**
 * Error codes enum for consistency
 */
export enum ErrorCode {
    // Authentication & Authorization
    UNAUTHORIZED = "UNAUTHORIZED",
    FORBIDDEN = "FORBIDDEN",
    INVALID_API_KEY = "INVALID_API_KEY",

    // Validation
    VALIDATION_ERROR = "VALIDATION_ERROR",
    INVALID_INPUT = "INVALID_INPUT",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

    // Resource errors
    NOT_FOUND = "NOT_FOUND",
    ALREADY_EXISTS = "ALREADY_EXISTS",
    CONFLICT = "CONFLICT",

    // Business logic
    INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
    ORDER_NOT_AVAILABLE = "ORDER_NOT_AVAILABLE",
    WALLET_LOCKED = "WALLET_LOCKED",
    INVALID_ORDER_STATUS = "INVALID_ORDER_STATUS",
    DUPLICATE_REQUEST = "DUPLICATE_REQUEST",

    // Rate limiting
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
    TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",

    // Server errors
    INTERNAL_ERROR = "INTERNAL_ERROR",
    DATABASE_ERROR = "DATABASE_ERROR",
    EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
}
