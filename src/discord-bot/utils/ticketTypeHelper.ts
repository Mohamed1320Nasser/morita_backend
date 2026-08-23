import { ButtonBuilder, ButtonStyle } from "discord.js";
import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

const BUTTON_STYLE_MAP: Record<string, ButtonStyle> = {
    green: ButtonStyle.Success,
    blue: ButtonStyle.Primary,
    red: ButtonStyle.Danger,
    gray: ButtonStyle.Secondary,
    orange: ButtonStyle.Secondary, 
};

export async function getActiveTicketTypesForGroup(groupKey: string) {
    try {
        const response: any = await discordApiClient.get(
            `/ticket-type-settings/group/${groupKey}`
        );

        if (response && response.data) {
            const types = response.data;

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

export function getTicketTypeLabel(ticketType: string): string {
    const labels: Record<string, string> = {
        PURCHASE_SERVICES_OSRS: "OSRS Service",
        PURCHASE_SERVICES_RS3: "RS3 Service",
        BUY_GOLD_OSRS: "Buy OSRS Gold",
        BUY_GOLD_RS3: "Buy RS3 Gold",
        SELL_GOLD_OSRS: "Sell OSRS Gold",
        SELL_GOLD_RS3: "Sell RS3 Gold",
        SWAP_CRYPTO: "Crypto Swap",
        PURCHASE_ACCOUNT: "Account Purchase",
        GENERAL: "Support",
    };

    return labels[ticketType] || "Support";
}

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
