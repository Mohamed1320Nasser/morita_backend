import { EmbedBuilder, ActionRowBuilder, ButtonBuilder } from "discord.js";
import axios from "axios";
import {
    getActiveTicketTypesForGroup,
    buildButtonsFromTicketTypes,
} from "../utils/ticketTypeHelper";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

export async function buildPurchaseServicesMessage() {
    // Fetch active ticket types for the services group
    const activeTypes = await getActiveTicketTypesForGroup("services");

    // Fetch settings from database for PURCHASE_SERVICES_OSRS
    let welcomeTitle = "";
    let welcomeMessage = "";
    let bannerUrl = "";
    let thumbnailUrl = "";
    let embedColor = 0x5865F2;
    let footerText = "morita | Professional Gaming Services";

    try {
        const response = await axios.get(
            `${discordConfig.apiBaseUrl}/ticket-type-settings/PURCHASE_SERVICES_OSRS`
        );

        if (response.data && response.data.data) {
            const settings = response.data.data;
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

    // Build embed
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setDescription(welcomeMessage)
        .setFooter({
            text: footerText
        })
        .setTimestamp();

    // Add title if provided
    if (welcomeTitle) {
        embed.setTitle(welcomeTitle);
    }

    // Add thumbnail (small logo in top-right) if provided
    if (thumbnailUrl) {
        embed.setThumbnail(thumbnailUrl);
    }

    // Add banner image (large image at bottom) if provided
    if (bannerUrl) {
        embed.setImage(bannerUrl);
    }

    // Build buttons dynamically from active ticket types
    const buttons = buildButtonsFromTicketTypes(activeTypes);

    // If no active types, return embed with no buttons
    if (buttons.length === 0) {
        return { embeds: [embed], components: [] };
    }

    // Split buttons into rows (max 5 per row)
    const buttonRows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < buttons.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...buttons.slice(i, i + 5)
        );
        buttonRows.push(row);
    }

    return { embeds: [embed], components: buttonRows };
}
