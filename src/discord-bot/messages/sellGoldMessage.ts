import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import {
    getActiveTicketTypesForGroup,
    buildButtonsFromTicketTypes,
} from "../utils/ticketTypeHelper";

export async function buildSellGoldMessage() {
    // Fetch active ticket types for the sell-gold group
    const activeTypes = await getActiveTicketTypesForGroup("sell-gold");

    const embed = new EmbedBuilder()
        .setColor(0xE74C3C) // Red color
        .setTitle("💸 Best Rates. Instant Payment. 100% Safe!")
        .setDescription(
            "**💰 Want to Sell OSRS or RS3 Gold? Here's How:**\n\n" +
            "**1️⃣ Open a ticket** by clicking the button below.\n" +
            "**2️⃣ Get our current rates** - one of our staff members will respond instantly.\n" +
            "**3️⃣ Agree on a price** and we'll send you our meeting world and location.\n" +
            "**4️⃣ Receive your payment** through your preferred method - all within minutes!\n\n" +
            "**⭐ Why Sell to Us**\n" +
            "⚡ **Instant response** - 24/7 availability\n" +
            "💰 **Highest market rates guaranteed**\n" +
            "🛡️ **Trusted buyers** - 100% secure transactions\n" +
            "🚀 **Fast payouts** - typically within 5 minutes"
        )
        .setFooter({
            text: "morita"
        })
        .setTimestamp();

    // Build buttons dynamically
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
