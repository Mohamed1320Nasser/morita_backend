import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import logger from "../../common/loggers";

/**
 * Discord sends a unicode option emoji back as { id: null, name: "🎮" }, and
 * discord.js refuses id: null when the option is rebuilt. Keep only real values.
 */
function cleanEmoji(emoji: any) {
    if (!emoji || typeof emoji !== "object") return undefined;
    const cleaned: { id?: string; name?: string; animated?: boolean } = {};
    if (emoji.id) cleaned.id = String(emoji.id);
    if (emoji.name) cleaned.name = String(emoji.name);
    if (emoji.animated) cleaned.animated = true;
    return cleaned.id || cleaned.name ? cleaned : undefined;
}

function isSelectMenu(component: any) {
    return component?.type === 3 || component?.data?.type === 3;
}

/**
 * Rebuilds a message's select menus with the user's checkmark cleared, so a
 * shared channel dropdown is ready for the next person.
 *
 * Returns null when any menu could not be rebuilt. Callers must then leave the
 * message alone (deferUpdate) instead of writing back a shorter list: writing
 * back fewer rows deletes those dropdowns from the channel for everyone.
 *
 * @param keepDefault options that should stay selected (e.g. a category header)
 */
export function rebuildSelectMenusWithoutDefaults(
    messageComponents: any[],
    keepDefault: (value: string) => boolean = () => false
): ActionRowBuilder<StringSelectMenuBuilder>[] | null {
    const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
    let expected = 0;

    for (const row of messageComponents || []) {
        for (const component of row.components || []) {
            if (!isSelectMenu(component)) continue;
            expected++;

            try {
                const menu = StringSelectMenuBuilder.from(component);
                menu.setOptions(
                    (menu.options || []).map((opt: any) => {
                        const data = opt.data || opt;
                        return {
                            label: data.label,
                            value: data.value,
                            ...(data.description ? { description: data.description } : {}),
                            ...(cleanEmoji(data.emoji) ? { emoji: cleanEmoji(data.emoji) } : {}),
                            default: keepDefault(String(data.value || "")),
                        };
                    })
                );
                rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
            } catch (error) {
                logger.error(
                    `[SelectMenuReset] Could not rebuild menu ${component?.customId || component?.data?.custom_id}:`,
                    error instanceof Error ? error.message : error
                );
            }
        }
    }

    if (rows.length !== expected) {
        logger.warn(`[SelectMenuReset] Rebuilt ${rows.length}/${expected} menus; leaving the message unchanged`);
        return null;
    }

    return rows;
}
