import { ColorResolvable } from "discord.js";
import { COLORS } from "../constants/colors";

export const embedConfig = {
    
    defaultColor: COLORS.PRIMARY as ColorResolvable,
    defaultThumbnail:
        process.env.BRAND_LOGO_URL ||
        "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮",
    defaultFooter: {
        text: "MORITA Gaming Services",
        iconURL:
            process.env.BRAND_LOGO_URL ||
            "https://via.placeholder.com/16x16/c9a961/1a2744?text=🎮",
    },

    brand: {
        name: "MORITA",
        website: "https://morita-gaming.com",
        support: "Need help? Use /ticket to open a support ticket",
        poweredBy: "Powered by MORITA Bot",
    },

    colors: {
        primary: COLORS.PRIMARY,
        success: COLORS.SUCCESS,
        warning: COLORS.WARNING,
        error: COLORS.ERROR,
        info: COLORS.INFO,
        premium: COLORS.PREMIUM,
        crypto: COLORS.CRYPTO,
    },

    templates: {
        services: {
            title: "🎮 MORITA Gaming Services",
            description:
                "Professional OSRS Services & Premium Gaming Solutions",
            color: COLORS.PRIMARY,
        },
        pricing: {
            title: "💰 Price Calculator",
            color: COLORS.INFO,
        },
        order: {
            title: "📦 Create Order",
            color: COLORS.SUCCESS,
        },
        ticket: {
            title: "🎫 Support Ticket",
            color: COLORS.WARNING,
        },
        help: {
            title: "🤖 MORITA Bot Help",
            color: COLORS.PRIMARY,
        },
        error: {
            title: "❌ Error",
            color: COLORS.ERROR,
        },
        success: {
            title: "✅ Success",
            color: COLORS.SUCCESS,
        },
    },

    limits: {
        maxFields: 25,
        maxFieldNameLength: 256,
        maxFieldValueLength: 1024,
        maxDescriptionLength: 4096,
        maxTitleLength: 256,
        maxFooterTextLength: 2048,
    },

    timestamps: {
        enabled: true,
        format: "R", 
    },

    thumbnails: {
        enabled: true,
        defaultSize: 64,
        fallbackUrl: "https://via.placeholder.com/64x64/c9a961/1a2744?text=🎮",
    },

    images: {
        enabled: true,
        maxSize: 8 * 1024 * 1024, 
        allowedFormats: ["png", "jpg", "jpeg", "gif", "webp"],
    },
};
