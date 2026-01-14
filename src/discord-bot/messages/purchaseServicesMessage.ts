import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import {
    getActiveTicketTypesForGroup,
    buildButtonsFromTicketTypes,
} from "../utils/ticketTypeHelper";
import { discordApiClient } from "../clients/DiscordApiClient";
import logger from "../../common/loggers";

export async function buildPurchaseServicesMessage() {
    
    const activeTypes = await getActiveTicketTypesForGroup("services");

    let welcomeTitle = "";
    let welcomeMessage = "";
    let bannerUrl = "";
    let thumbnailUrl = "";
    let embedColor = 0x5865F2;
    let footerText = "morita | Professional Gaming Services";

    try {
        const response: any = await discordApiClient.get(
            `/ticket-type-settings/PURCHASE_SERVICES_OSRS`
        );

        if (response && response.data) {
            const settings = response.data;
            welcomeTitle = settings.welcomeTitle || "";
            welcomeMessage = settings.welcomeMessage || "";
            bannerUrl = settings.bannerUrl || "";
            thumbnailUrl = settings.thumbnailUrl || "";
            embedColor = settings.embedColor ? parseInt(settings.embedColor, 16) : 0x5865F2;
            footerText = settings.footerText || "morita | Professional Gaming Services";
        }
    } catch (error) {
        logger.error("Error fetching ticket type settings for purchase-services:", error);
        welcomeMessage = "🎮 **OSRS & RS3 Services** - Click a button below to get started!";
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setDescription(welcomeMessage)
        .setFooter({
            text: footerText
        })
        .setTimestamp();

    if (welcomeTitle) {
        embed.setTitle(welcomeTitle);
    }

    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (bannerUrl) {
        embed.setImage(bannerUrl);
    }

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
