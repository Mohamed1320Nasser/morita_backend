import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { Service } from "../../types/discord.types";

export class ServiceButtonComponent {
    
    static createServiceDetailButton(
        service: Service
    ): ActionRowBuilder<ButtonBuilder> {
        const button = new ButtonBuilder()
            .setCustomId(`pricing_service_${service.id}_details`)
            .setLabel(`→ ${service.name} ←`)
            .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    }

    static createMoreInfoButton(
        serviceId: string
    ): ActionRowBuilder<ButtonBuilder> {
        const button = new ButtonBuilder()
            .setCustomId(`pricing_service_${serviceId}_more_info`)
            .setLabel("Click here for more information")
            .setStyle(ButtonStyle.Link)
            .setURL("https://morita-gaming.com"); 

        return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    }

    static createOrderNowButton(
        serviceId: string
    ): ActionRowBuilder<ButtonBuilder> {
        const button = new ButtonBuilder()
            .setCustomId(`pricing_service_${serviceId}_order`)
            .setLabel("Order Now")
            .setStyle(ButtonStyle.Success)
            .setEmoji("🛒");

        return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    }
}
