import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
} from "discord.js";

export interface SelectableModifier {
    id?: string;
    name: string;
    type: string;
    displayType?: string;
    value: number;
    applied?: boolean;
}

export const MODIFIER_SELECT_PREFIX = "mod_select_";
export const MODIFIER_RESET_PREFIX = "mod_reset_";

const DISPLAY_ICONS: Record<string, string> = {
    UPCHARGE: "🔺",
    DISCOUNT: "🔻",
    NOTE: "📝",
    WARNING: "⚠️",
    NORMAL: "⚙️",
};

/**
 * Pick the icon from the actual effect on price where we can, so a modifier
 * mislabelled in the dashboard still reads correctly to the customer.
 */
export function modifierIcon(displayType?: string, value?: number): string {
    if (typeof value === "number" && value !== 0) {
        if (value < 0) return DISPLAY_ICONS.DISCOUNT;
        if (displayType === "NOTE" || displayType === "WARNING") {
            return DISPLAY_ICONS[displayType];
        }
        return DISPLAY_ICONS.UPCHARGE;
    }

    return DISPLAY_ICONS[displayType || "NORMAL"] || "⚙️";
}

/**
 * Format a modifier's value the way customers read it: "+30%" or "+$13.00".
 */
export function formatModifierValue(mod: SelectableModifier): string {
    const value = Number(mod.value);
    const sign = value >= 0 ? "+" : "-";
    const abs = Math.abs(value);

    return mod.type === "PERCENTAGE"
        ? `${sign}${abs}%`
        : `${sign}$${abs.toFixed(2)}`;
}

/**
 * Summarise the optional extras above the price.
 *
 * Listing every option as a chip made the message as wide as the longest few
 * names combined, and the picker below already shows the full list with the
 * same values. So we name only what the customer actually selected, one per
 * line, and otherwise just say how many are available.
 */
const MAX_LISTED = 6;

export function buildModifierBadges(
    modifiers: SelectableModifier[],
    selectedIds: string[] = []
): string {
    if (!modifiers || modifiers.length === 0) {
        return "";
    }

    const selected = modifiers.filter(
        mod => mod.id && selectedIds.includes(mod.id)
    );

    if (selected.length === 0) {
        const count = modifiers.length;
        return `-# ${count} optional ${count === 1 ? "extra" : "extras"} available below`;
    }

    const listed = selected.slice(0, MAX_LISTED);
    const hidden = selected.length - listed.length;

    const lines = listed.map(
        mod =>
            `${modifierIcon(mod.displayType, Number(mod.value))} ${mod.name.trim()} \`${formatModifierValue(mod)}\``
    );

    if (hidden > 0) {
        lines.push(`-# and ${hidden} more selected`);
    }

    return lines.join("\n");
}

/**
 * Summarise which options are priced in, for the breakdown block.
 */
export function buildAppliedSummary(
    modifiers: SelectableModifier[],
    selectedIds: string[]
): string[] {
    const applied = modifiers.filter(m => m.id && selectedIds.includes(m.id));

    if (applied.length === 0) {
        return ["No options selected — base price shown"];
    }

    return applied.map(
        m => `${modifierIcon(m.displayType, Number(m.value))} ${m.name.trim()} ${formatModifierValue(m)}`
    );
}

/**
 * Build the option picker. `token` identifies the calculation being adjusted
 * so the handler can recalculate with the same inputs.
 */
export function buildModifierSelectRow(
    token: string,
    modifiers: SelectableModifier[],
    selectedIds: string[] = []
): ActionRowBuilder<StringSelectMenuBuilder> | null {
    const selectable = modifiers.filter(
        m => m.id && m.displayType !== "NOTE" && m.displayType !== "WARNING"
    );

    if (selectable.length === 0) {
        return null;
    }

    const options = selectable.slice(0, 25).map(mod =>
        new StringSelectMenuOptionBuilder()
            .setLabel(`${mod.name.trim()} ${formatModifierValue(mod)}`.slice(0, 100))
            .setValue(mod.id!)
            .setDescription(
                mod.type === "PERCENTAGE"
                    ? `Adds ${formatModifierValue(mod)} to the price`
                    : `Adds ${formatModifierValue(mod)} to the total`
            )
            .setEmoji(modifierIcon(mod.displayType, Number(mod.value)))
            .setDefault(selectedIds.includes(mod.id!))
    );

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`${MODIFIER_SELECT_PREFIX}${token}`)
        .setPlaceholder("⚙️  Select the options that apply to you")
        .setMinValues(0)
        .setMaxValues(options.length)
        .addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/**
 * Reset button, only useful once something is selected.
 */
export function buildModifierResetRow(
    token: string,
    selectedIds: string[]
): ActionRowBuilder<ButtonBuilder> | null {
    if (selectedIds.length === 0) {
        return null;
    }

    const reset = new ButtonBuilder()
        .setCustomId(`${MODIFIER_RESET_PREFIX}${token}`)
        .setLabel("Clear selected options")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("↩️");

    return new ActionRowBuilder<ButtonBuilder>().addComponents(reset);
}
