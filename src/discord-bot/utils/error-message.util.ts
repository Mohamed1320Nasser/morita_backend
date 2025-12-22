/**
 * Extract user-friendly error message from API error response
 * Handles various error formats from backend API and axios
 * @returns Always returns a string, never undefined
 */
export function extractErrorMessage(error: any): string {
    // Handle null/undefined
    if (!error) {
        return "Unknown error occurred";
    }

    // Try to get backend API error message
    if (error?.response?.data?.message && typeof error.response.data.message === 'string') {
        return error.response.data.message;
    }

    if (error?.response?.data?.error && typeof error.response.data.error === 'string') {
        return error.response.data.error;
    }

    // Check if it's a custom error with message
    if (error?.message && typeof error.message === 'string') {
        // Skip generic HTTP status code messages
        if (!error.message.includes("status code")) {
            return error.message;
        }

        // Translate HTTP status codes to user-friendly messages
        if (error.message.includes("status code 500")) {
            return "Internal server error. Please try again or contact support.";
        }

        if (error.message.includes("status code 404")) {
            return "Resource not found.";
        }

        if (error.message.includes("status code 401")) {
            return "Unauthorized. Please check your permissions.";
        }

        if (error.message.includes("status code 403")) {
            return "Forbidden. You don't have permission to perform this action.";
        }

        // Return the message even if it contains "status code"
        return error.message;
    }

    // Handle Error objects
    if (error instanceof Error) {
        return error.message || "Unknown error occurred";
    }

    // Convert any other type to string
    if (typeof error === 'string') {
        return error;
    }

    // Last resort
    return "Unknown error occurred";
}

/**
 * Check if error is a specific type
 * Uses safe string comparison to prevent crashes
 */
export function isInsufficientBalanceError(error: any): boolean {
    try {
        const message = extractErrorMessage(error);
        return message.toLowerCase().includes("insufficient balance");
    } catch (err) {
        return false;
    }
}

export function isNotFoundError(error: any): boolean {
    try {
        return error?.response?.status === 404 ||
               extractErrorMessage(error).toLowerCase().includes("not found");
    } catch (err) {
        return false;
    }
}

export function isUnauthorizedError(error: any): boolean {
    try {
        const message = extractErrorMessage(error);
        return error?.response?.status === 401 ||
               error?.response?.status === 403 ||
               message.toLowerCase().includes("unauthorized") ||
               message.toLowerCase().includes("permission");
    } catch (err) {
        return false;
    }
}
