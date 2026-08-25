
export const COLORS = {
    
    PRIMARY: "#fca311", 
    SECONDARY: "#fca311", 
    ACCENT: "#fca311", 

    SUCCESS: "#fca311", 
    WARNING: "#fca311", 
    INFO: "#fca311", 
    ERROR: "#ED4245", 
    PREMIUM: "#fca311", 
    CRYPTO: "#fca311", 

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

    MEGASCALE: "#fca311", 
    CAPES: "#fca311", 
    BLOOD_TORVA: "#fca311", 
    RAIDS: "#fca311", 
    BOSSING: "#fca311", 
    COMBAT: "#fca311", 
    ACCOUNTS: "#fca311", 
    QUESTS: "#fca311", 
    MINIGAMES: "#fca311", 
    IRONMAN: "#fca311", 
    SKILLS: "#fca311", 
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
