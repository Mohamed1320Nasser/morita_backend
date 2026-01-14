import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
import { ServiceCategory, Service } from "../../types/discord.types";

export class CategoryButtonComponent {
    
    static createCategoryToggleButton(
        category: ServiceCategory,
        isExpanded: boolean = false
    ): ActionRowBuilder<ButtonBuilder> {
        const button = new ButtonBuilder()
            .setCustomId(`pricing_category_${category.id}_toggle`)
            .setLabel(
                `${category.emoji} ${category.name} - Click Here ${isExpanded ? "▲" : "▼"}`
            )
            .setStyle(ButtonStyle.Secondary);

        return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    }

    static createServiceButtons(
        services: Service[]
    ): ActionRowBuilder<ButtonBuilder>[] {
        const rows: ActionRowBuilder<ButtonBuilder>[] = [];
        const maxButtonsPerRow = 5;

        for (let i = 0; i < services.length; i += maxButtonsPerRow) {
            const row = new ActionRowBuilder<ButtonBuilder>();
            const serviceGroup = services.slice(i, i + maxButtonsPerRow);

            serviceGroup.forEach(service => {
                const button = new ButtonBuilder()
                    .setCustomId(`pricing_service_${service.id}_details`)
                    .setLabel(service.name)
                    .setStyle(ButtonStyle.Primary);

                row.addComponents(button);
            });

            rows.push(row);
        }

        return rows;
    }
}
