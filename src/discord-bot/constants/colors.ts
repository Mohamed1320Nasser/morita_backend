
export const COLORS = {
    
    PRIMARY: "#c9a961", 
    SECONDARY: "#1a2744", 
    ACCENT: "#d4af37", 

    SUCCESS: "#57F287", 
    WARNING: "#FEE75C", 
    INFO: "#5865F2", 
    ERROR: "#ED4245", 
    PREMIUM: "#9B59B6", 
    CRYPTO: "#F39C12", 

    TEXT_PRIMARY: "#e8e8e8", 
    TEXT_SECONDARY: "#b9bbbe", 
    TEXT_MUTED: "#72767D", 

    BACKGROUND_PRIMARY: "#0d1b2a", 
    BACKGROUND_SECONDARY: "#1a2744", 
    BACKGROUND_TERTIARY: "#2c3e50", 

    WHITE: "#FFFFFF",
    BLACK: "#000000",
    GRAY: "#2C2F33",
    LIGHT_GRAY: "#99AAB5",
    DARK_GRAY: "#23272A",

    MEGASCALE: "#c9a961", 
    CAPES: "#d4af37", 
    BLOOD_TORVA: "#1a2744", 
    RAIDS: "#c9a961", 
    BOSSING: "#d4af37", 
    COMBAT: "#c9a961", 
    ACCOUNTS: "#1a2744", 
    QUESTS: "#d4af37", 
    MINIGAMES: "#c9a961", 
    IRONMAN: "#1a2744", 
    SKILLS: "#d4af37", 
} as const;

export const COLOR_MAPPING = {
    
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

    PENDING: COLORS.WARNING,
    IN_PROGRESS: COLORS.INFO,
    COMPLETED: COLORS.SUCCESS,
    CANCELLED: COLORS.ERROR,

    CRYPTO: COLORS.CRYPTO,
    NON_CRYPTO: COLORS.INFO,

    FIXED: COLORS.PRIMARY,
    PER_LEVEL: COLORS.SUCCESS,
    PER_KILL: COLORS.ERROR,
    PER_ITEM: COLORS.WARNING,
    PER_HOUR: COLORS.INFO,
} as const;
