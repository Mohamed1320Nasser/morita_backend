// Bot response messages
export const MESSAGES = {
    // General
    WELCOME: "🎮 Welcome to Morita Gaming Services!",
    LOADING: "⏳ Loading...",
    ERROR: "❌ An error occurred. Please try again later.",
    SUCCESS: "✅ Success!",
    CANCELLED: "❌ Operation cancelled.",

    // Services
    SERVICES_TITLE: "🎮 Morita Services",
    SERVICES_SUBTITLE: "Professional OSRS Services & Premium Gaming Solutions",
    SELECT_CATEGORY: "Select a service category to browse:",
    SELECT_SERVICE: "Select a service to view details:",
    NO_SERVICES: "No services available in this category.",
    SERVICE_DETAILS: "Service Details",

    // Pricing
    PRICING_TITLE: "💰 Price Calculator",
    SELECT_METHOD: "Select pricing method:",
    SELECT_PAYMENT: "Select payment method:",
    ADDITIONAL_OPTIONS: "Additional Options:",
    CALCULATING: "🧮 Calculating price...",
    PRICE_BREAKDOWN: "Price Breakdown",
    BASE_PRICE: "Base Price",
    PAYMENT_METHOD: "Payment Method",
    MODIFIERS: "Modifiers",
    TOTAL_PRICE: "Total Price",
    NO_MODIFIERS: "No modifiers applied",

    // Orders
    ORDER_TITLE: "📝 Order Details",
    ORDER_CONFIRMATION: "Order Confirmation",
    ORDER_CREATED: "Order created successfully!",
    ORDER_CANCELLED: "Order cancelled.",
    FILL_DETAILS: "Please fill in your order details:",
    OSRS_USERNAME: "OSRS Username",
    DISCORD_TAG: "Discord Tag",
    SPECIAL_NOTES: "Special Notes (Optional)",
    REVIEW_ORDER: "Please review your order:",
    CONFIRM_ORDER: "Confirm Order",
    CANCEL_ORDER: "Cancel Order",

    // Tickets
    TICKET_CREATED: "🎫 Ticket created successfully!",
    TICKET_TITLE: "Order Ticket",
    ORDER_STATUS: "Order Status",
    CUSTOMER_INFO: "Customer Information",
    SERVICE_INFO: "Service Information",
    PAYMENT_INFO: "Payment Information",
    ACCOUNT_INFO: "Account Information",
    WORKER_ACTIONS: "Worker Actions",
    ACCEPT_ORDER: "Accept Order",
    UPDATE_STATUS: "Update Status",
    COMPLETE_ORDER: "Complete Order",

    // Errors
    INVALID_SERVICE: "Invalid service selected.",
    INVALID_METHOD: "Invalid pricing method selected.",
    INVALID_PAYMENT: "Invalid payment method selected.",
    CALCULATION_ERROR: "Error calculating price. Please try again.",
    ORDER_ERROR: "Error creating order. Please try again.",
    TICKET_ERROR: "Error creating ticket. Please try again.",
    API_ERROR: "Service temporarily unavailable. Please try again later.",
    PERMISSION_ERROR: "You do not have permission to perform this action.",
    VALIDATION_ERROR: "Please provide valid information.",

    // Success messages
    PRICE_CALCULATED: "Price calculated successfully!",
    ORDER_SUBMITTED: "Order submitted successfully!",
    TICKET_OPENED: "Ticket opened successfully!",
    STATUS_UPDATED: "Status updated successfully!",

    // Help
    HELP_TITLE: "🤖 Morita Bot Help",
    HELP_DESCRIPTION: "Here are the available commands:",
    COMMANDS: {
        SERVICES: {
            name: "/services",
            description: "Browse available gaming services",
            usage: "Use the dropdown menu to select a category and service",
        },
        PRICING: {
            name: "/pricing",
            description: "Calculate service pricing",
            usage: "/pricing <service> - Select service and options to calculate price",
        },
        ORDER: {
            name: "/order",
            description: "Create a new order",
            usage: "/order <service> - Directly create an order for a service",
        },
        TICKET: {
            name: "/ticket",
            description: "Open a support ticket",
            usage: "/ticket - Create a ticket for custom requests or support",
        },
        HELP: {
            name: "/help",
            description: "Show this help message",
            usage: "/help - Display all available commands",
        },
    },

    // Footer messages
    FOOTER: {
        BRAND: "Morita Gaming Services",
        WEBSITE: "https://morita-gaming.com",
        SUPPORT: "Need help? Use /ticket to open a support ticket",
        POWERED_BY: "Powered by Morita Bot",
    },

    // Status messages
    STATUS: {
        PENDING: "⏳ Pending",
        IN_PROGRESS: "🔄 In Progress",
        COMPLETED: "✅ Completed",
        CANCELLED: "❌ Cancelled",
    },

    // Payment methods
    PAYMENT: {
        CRYPTO: "💎 Crypto",
        NON_CRYPTO: "💳 Non-Crypto",
        BITCOIN: "₿ Bitcoin",
        ETHEREUM: "Ξ Ethereum",
        PAYPAL: "PayPal",
        BANK_TRANSFER: "🏦 Bank Transfer",
    },

    // Pricing units
    PRICING_UNITS: {
        FIXED: "Fixed Price",
        PER_LEVEL: "Per Level",
        PER_KILL: "Per Kill",
        PER_ITEM: "Per Item",
        PER_HOUR: "Per Hour",
    },
} as const;
