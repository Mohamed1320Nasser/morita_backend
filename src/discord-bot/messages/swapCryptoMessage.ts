import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import {
    getActiveTicketTypesForGroup,
    buildButtonsFromTicketTypes,
} from "../utils/ticketTypeHelper";

export async function buildSwapCryptoMessage() {
    
    const activeTypes = await getActiveTicketTypesForGroup("crypto-swap");

    const embed = new EmbedBuilder()
        .setColor(0x9B59B6) 
        .setTitle("🔄 Swap Cryptocurrency")
        .setDescription(
            "**Ready to Swap Your Crypto?**\n\n" +
            "Open a ticket now and let us handle your crypto swap with care.\n" +
            "Safe, smooth, and trusted every step of the way. ✅\n\n" +
            "**Supported Cryptocurrencies:**\n" +
            "• Bitcoin (BTC)\n" +
            "• Ethereum (ETH)\n" +
            "• USDT (Tether)\n" +
            "• And more!\n\n" +
            "**🔄 Swap Options:**\n" +
            "• Crypto → OSRS/RS3 Gold\n" +
            "• OSRS/RS3 Gold → Crypto"
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
