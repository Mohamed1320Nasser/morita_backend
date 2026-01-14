
export function extractErrorMessage(error: any): string {
    
    if (!error) {
        return "Unknown error occurred";
    }

    if (error?.response?.data?.message && typeof error.response.data.message === 'string') {
        return error.response.data.message;
    }

    if (error?.response?.data?.error && typeof error.response.data.error === 'string') {
        return error.response.data.error;
    }

    if (error?.message && typeof error.message === 'string') {
        
        if (!error.message.includes("status code")) {
            return error.message;
        }

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

        return error.message;
    }

    if (error instanceof Error) {
        return error.message || "Unknown error occurred";
    }

    if (typeof error === 'string') {
        return error;
    }

    return "Unknown error occurred";
}

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
