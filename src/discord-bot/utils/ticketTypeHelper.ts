import axios from "axios";
import { ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../common/loggers";
import { discordConfig } from "../config/discord.config";

// Button color mapping
const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
    green: ButtonStyle.Success,
    blue: ButtonStyle.Primary,
    red: ButtonStyle.Danger,
    gray: ButtonStyle.Secondary,
    orange: ButtonStyle.Secondary, // Discord doesn't have orange, use Secondary
};

/**
 * Fetch active ticket types for a specific group
 * @param groupKey - The group key (e.g., 'services', 'buy-gold', 'sell-gold')
 * @returns Array of active ticket type settings
 */
export async function getActiveTicketTypesForGroup(groupKey: string) {
    try {
        const response = await axios.get(
            `${discordConfig.apiBaseUrl}/ticket-type-settings/group/${groupKey}`
        );

        if (response.data && response.data.data) {
            const types = response.data.data;

            const activeTypes = types
                .filter((type: any) => type.isActive === true)
                .sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));

            return activeTypes;
        }

        logger.warn(`No ticket types found for group: ${groupKey}`);
        return [];
    } catch (error) {
        logger.error(`Error fetching ticket types for group ${groupKey}:`, error);
        return [];
    }
}

/**
 * Build Discord buttons from ticket type settings
 * @param types - Array of ticket type settings
 * @returns Array of ButtonBuilder instances
 */
export function buildButtonsFromTicketTypes(types: any[]): ButtonBuilder[] {
    return types.map((type) => {
        const buttonStyle = BUTTON_STYLE_MAP[type.buttonColor] || ButtonStyle.Primary;

        return new ButtonBuilder()
            .setCustomId(`create_ticket_${type.ticketType}`)
            .setLabel(type.buttonLabel || type.ticketType)
            .setStyle(buttonStyle)
            .setEmoji(getEmojiForType(type.ticketType));
    });
}

/**
 * Get emoji for a ticket type
 * @param ticketType - The ticket type enum value
 * @returns Emoji string
 */
function getEmojiForType(ticketType: string): string {
    const emojiMap: Record<string, string> = {
        PURCHASE_SERVICES_OSRS: "🎮",
        PURCHASE_SERVICES_RS3: "🎮",
        BUY_GOLD_OSRS: "💰",
        BUY_GOLD_RS3: "💰",
        SELL_GOLD_OSRS: "💵",
        SELL_GOLD_RS3: "💵",
        SWAP_CRYPTO: "🔄",
        GENERAL: "💬",
    };

    return emojiMap[ticketType] || "📋";
}
