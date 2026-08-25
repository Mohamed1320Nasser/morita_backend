import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import {
    getActiveTicketTypesForGroup,
    buildButtonsFromTicketTypes,
} from "../utils/ticketTypeHelper";

export async function buildPurchaseGoldMessage() {
    
    const activeTypes = await getActiveTicketTypesForGroup("buy-gold");

    const embed = new EmbedBuilder()
        .setColor(0xfca311) 
        .setTitle("💰 Buy OSRS & RS3 Gold Instantly - Safe & Easy!")
        .setDescription(
            "**💵 Want to Buy OSRS or RS3 Gold? Here's How:**\n\n" +
            "**1️⃣ Open a ticket** by clicking the button below.\n" +
            "**2️⃣ Get our current rates** - one of our staff will reply instantly.\n" +
            "**3️⃣ Make your payment** through your preferred method.\n" +
            "**4️⃣ Receive your gold** - we'll send the world and location. Delivery takes just minutes!\n\n" +
            "**🚀 Delivery Methods**\n" +
            "• F2P & P2P\n" +
            "• Drop Trading\n" +
            "• Tip Jar in POH\n" +
            "• PvP Death\n" +
            "• High-Level Account Transfer\n" +
            "• OSRS / RS3 Items\n\n" +
            "**⭐ Why Choose Us**\n" +
            "⚡ **Instant response** - available 24/7\n" +
            "💰 **Best market rates** - always competitive\n" +
            "🛡️ **Trusted accounts only** - no level 3s\n" +
            "🚀 **Fast & secure delivery** - within minutes"
        )
        .setFooter({
            text: "morita"
        })
        .setTimestamp();

    const buttons = buildButtonsFromTicketTypes(activeTypes);

    if (buttons.length === 0) {
        return { embeds: [embed], components: [] };
    }

    const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...buttons.slice(i, i + 5)
        );
        buttonRows.push(row);
    }

    return { embeds: [embed], components: buttonRows };
}
