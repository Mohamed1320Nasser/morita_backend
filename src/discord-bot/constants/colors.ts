// Discord embed colors - Morita Brand
export const COLORS = {
    // Morita Brand colors
    PRIMARY: "#c9a961", // Bronze/Gold from logo
    SECONDARY: "#1a2744", // Navy Blue background
    ACCENT: "#d4af37", // Lighter bronze for highlights

    // Status colors (keeping Discord standards)
    SUCCESS: "#57F287", // Green
    WARNING: "#FEE75C", // Yellow
    INFO: "#5865F2", // Blue
    ERROR: "#ED4245", // Red
    PREMIUM: "#9B59B6", // Purple
    CRYPTO: "#F39C12", // Orange

    // Text colors
    TEXT_PRIMARY: "#e8e8e8", // Light gray for main text
    TEXT_SECONDARY: "#b9bbbe", // Medium gray for secondary text
    TEXT_MUTED: "#72767D", // Muted gray

    // Background colors
    BACKGROUND_PRIMARY: "#0d1b2a", // Dark navy background
    BACKGROUND_SECONDARY: "#1a2744", // Navy blue for cards
    BACKGROUND_TERTIARY: "#2c3e50", // Darker navy

    // Neutral colors
    WHITE: "#FFFFFF",
    BLACK: "#000000",
    GRAY: "#2C2F33",
    LIGHT_GRAY: "#99AAB5",
    DARK_GRAY: "#23272A",

    // Service category colors (using brand palette)
    MEGASCALE: "#c9a961", // Bronze
    CAPES: "#d4af37", // Lighter bronze
    BLOOD_TORVA: "#1a2744", // Navy blue
    RAIDS: "#c9a961", // Bronze
    BOSSING: "#d4af37", // Lighter bronze
    COMBAT: "#c9a961", // Bronze
    ACCOUNTS: "#1a2744", // Navy blue
    QUESTS: "#d4af37", // Lighter bronze
    MINIGAMES: "#c9a961", // Bronze
    IRONMAN: "#1a2744", // Navy blue
    SKILLS: "#d4af37", // Lighter bronze
} as const;

// Color mapping for different contexts
export const COLOR_MAPPING = {
    // Service categories
    megascale: COLORS.MEGASCALE,
    "capes-quiver": COLORS.CAPES,
    "blood-torva": COLORS.BLOOD_TORVA,
    raids: COLORS.RAIDS,
    bossing: COLORS.BOSSING,
    "combat-achievements": COLORS.COMBAT,
    "accounts-bundle": COLORS.ACCOUNTS,
    "quests-diaries-misc": COLORS.QUESTS,
    minigames: COLORS.MINIGAMES,
    "ironman-gathering": COLORS.IRONMAN,
    skills: COLORS.SKILLS,

    // Order status
    PENDING: COLORS.WARNING,
    IN_PROGRESS: COLORS.INFO,
    COMPLETED: COLORS.SUCCESS,
    CANCELLED: COLORS.ERROR,

    // Payment types
    CRYPTO: COLORS.CRYPTO,
    NON_CRYPTO: COLORS.INFO,

    // Pricing units
    FIXED: COLORS.PRIMARY,
    PER_LEVEL: COLORS.SUCCESS,
    PER_KILL: COLORS.ERROR,
    PER_ITEM: COLORS.WARNING,
    PER_HOUR: COLORS.INFO,
} as const;
