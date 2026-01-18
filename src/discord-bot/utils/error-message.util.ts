/**
 * Extract error message from various error types (Axios, Error, string, etc.)
 */
export function extractErrorMessage(error: any): string {
    if (!error) return "Unknown error occurred";

    // Axios error - get message from response
    const data = error?.response?.data;
    if (data) {
        // API returns: { msg, status, data: { message }, error }
        const msg = data.msg || data.message || data.data?.message || data.error;
        if (typeof msg === 'string') return msg;
        if (typeof data === 'string') return data;
    }

    // Regular error message (skip generic axios "status code" messages)
    if (typeof error.message === 'string' && !error.message.includes("status code")) {
        return error.message;
    }

    // String error
    if (typeof error === 'string') return error;

    return "Unknown error occurred";
}

/**
 * Check if error is related to insufficient balance
 */
export function isInsufficientBalanceError(error: any): boolean {
    return extractErrorMessage(error).toLowerCase().includes("insufficient balance");
}

/**
 * Check if error is a 404 not found
 */
export function isNotFoundError(error: any): boolean {
    return error?.response?.status === 404 ||
           extractErrorMessage(error).toLowerCase().includes("not found");
}

/**
 * Check if error is unauthorized/forbidden
 */
export function isUnauthorizedError(error: any): boolean {
    const status = error?.response?.status;
    return status === 401 || status === 403;
}
