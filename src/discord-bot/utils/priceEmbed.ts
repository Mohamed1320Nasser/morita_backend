import { EmbedBuilder } from "discord.js";

export const CALC_COLOR = 0xfca311;

const NAME_W = 20;
const MONEY_W = 10;
const XP_W = 12;
const LEVELS_W = 9;
const LABEL_W = 16;

const DIM = "\u001b[0;37m";
const CYAN = "\u001b[0;36m";
const GREEN = "\u001b[0;32m";
const YELLOW = "\u001b[0;33m";
const BOLD_YELLOW = "\u001b[1;33m";
const BOLD_GREEN = "\u001b[1;32m";
const RESET = "\u001b[0m";

export interface ScopeRow {
    startLevel: number;
    endLevel: number;
    xpRequired: number;
    totalPrice?: number;
    methodName?: string;
}

export interface OptionRow {
    name: string;
    range?: string;
    originalPrice?: number;
    finalPrice: number;
    discountPercent?: number;
    discountEmoji?: string;
    isBest?: boolean;
    // Set on rows that are one segment of the group above them; rendered
    // indented and dimmed so the group total reads as the headline figure.
    isChild?: boolean;
}

export interface AdjustmentRow {
    label: string;
    amount: number;
    type?: string;
    value?: number;
}

function money(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

function signedMoney(amount: number): string {
    const sign = amount < 0 ? "-" : "+";
    return `${sign}$${Math.abs(amount).toFixed(2)}`;
}

function num(value: number): string {
    return Math.round(value).toLocaleString("en-US");
}

function clip(text: string, width: number): string {
    const clean = String(text || "").trim();
    return clean.length > width ? `${clean.slice(0, width - 1)}…` : clean;
}

const EMOJI_PATTERN =
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu;

function stripEmoji(text: string): string {
    return text.replace(EMOJI_PATTERN, "").replace(/\s+/g, " ").trim();
}

function rule(width: number): string {
    return `${DIM}${"─".repeat(width)}${RESET}`;
}

function header(text: string): string {
    return `${DIM}${text}${RESET}`;
}

function block(lines: string[]): string {
    return "```ansi\n" + lines.join("\n") + "\n```";
}

export function buildLevelScope(
    skillName: string,
    segments: ScopeRow[],
    totalXp: number,
    discountPercent: number
): string {
    const discountText =
        discountPercent > 0 ? `${discountPercent.toFixed(1)}%` : "None";
    const discountCell =
        discountPercent > 0
            ? `${GREEN}${discountText}${RESET}`
            : `${DIM}${discountText}${RESET}`;

    if (!segments || segments.length <= 1) {
        const only = segments && segments[0];
        const start = only ? only.startLevel : 0;
        const end = only ? only.endLevel : 0;
        const xp = only ? only.xpRequired : totalXp;

        // Sized to the skill name rather than a fixed 20, which was padding the
        // row wide enough to wrap the Discount column onto its own line.
        const skillW = Math.min(NAME_W, Math.max("Skill".length, skillName.length) + 2);

        const headerText =
            "Skill".padEnd(skillW) +
            "Levels".padEnd(LEVELS_W) +
            "XP".padStart(XP_W) +
            "  " +
            "Discount";

        const row =
            `${CYAN}${clip(skillName, skillW - 1).padEnd(skillW)}${RESET}` +
            `${CYAN}${`${start} → ${end}`.padEnd(LEVELS_W)}${RESET}` +
            `${GREEN}${num(xp).padStart(XP_W)}${RESET}` +
            "  " +
            discountCell;

        return block([header(headerText), rule(headerText.length), row]);
    }

    const sorted = [...segments].sort((a, b) => a.startLevel - b.startLevel);

    const headerText =
        "Levels".padEnd(LEVELS_W) +
        "Method".padEnd(NAME_W) +
        "XP".padStart(XP_W) +
        "Cost".padStart(MONEY_W);

    const lines = [header(headerText), rule(headerText.length)];

    for (const seg of sorted) {
        lines.push(
            `${CYAN}${`${seg.startLevel} → ${seg.endLevel}`.padEnd(LEVELS_W)}${RESET}` +
                clip(seg.methodName || skillName, NAME_W - 1).padEnd(NAME_W) +
                `${GREEN}${num(seg.xpRequired).padStart(XP_W)}${RESET}` +
                `${YELLOW}${money(seg.totalPrice || 0).padStart(MONEY_W)}${RESET}`
        );
    }

    const segmentTotal = sorted.reduce((sum, s) => sum + (s.totalPrice || 0), 0);

    lines.push(rule(headerText.length));
    lines.push(
        `${CYAN}${`${sorted[0].startLevel} → ${sorted[sorted.length - 1].endLevel}`.padEnd(
            LEVELS_W
        )}${RESET}` +
            "".padEnd(NAME_W) +
            `${GREEN}${num(totalXp).padStart(XP_W)}${RESET}` +
            `${BOLD_GREEN}${money(segmentTotal).padStart(MONEY_W)}${RESET}`
    );

    if (discountPercent > 0) {
        lines.push(`${GREEN}Discount applied: ${discountText}${RESET}`);
    }

    return block(lines);
}

export function buildCountScope(
    label: string,
    name: string,
    amount: number,
    unit: string,
    discountPercent: number
): string {
    const discountText =
        discountPercent > 0 ? `${discountPercent.toFixed(1)}%` : "None";
    const discountCell =
        discountPercent > 0
            ? `${GREEN}${discountText}${RESET}`
            : `${DIM}${discountText}${RESET}`;

    const headerText =
        clip(label, NAME_W).padEnd(NAME_W) +
        unit.padStart(MONEY_W) +
        "  " +
        "Discount";

    const row =
        `${CYAN}${clip(name, NAME_W - 1).padEnd(NAME_W)}${RESET}` +
        `${CYAN}${num(amount).padStart(MONEY_W)}${RESET}` +
        "  " +
        discountCell;

    return block([header(headerText), rule(headerText.length), row]);
}

export function buildOptionsTable(options: OptionRow[]): string {
    if (!options || options.length === 0) {
        return "";
    }

    const anyDiscount = options.some(
        o => typeof o.originalPrice === "number" && o.originalPrice > o.finalPrice
    );

    const anyRange = options.some(o => Boolean(o.range));

    // Method names are the long values here, so give the column the space the
    // price and level columns do not need. Discounts add two more columns, so
    // the name has to give some of it back.
    const anyGroupTotal = options.some((o, i) => !o.isChild && options[i + 1]?.isChild && !o.isBest);

    // Size the name column to the longest name actually present rather than a
    // fixed maximum: a table of short names was padding every row out past the
    // width Discord fits, which wrapped the price onto its own line.
    const longestName = Math.max(
        "Method".length,
        ...options.map(o => {
            if (o.isChild) return 3;
            const bare = o.range
                ? String(o.name).replace(/\s*\(\d+\s*-\s*\d+\)\s*$/, "").trim()
                : String(o.name);
            return bare.length;
        })
    );

    const nameCap = anyDiscount ? (anyRange ? 18 : NAME_W + 4) : NAME_W + 8;
    const nameW = Math.min(nameCap, longestName + 2);
    const moneyW = (anyDiscount ? 9 : MONEY_W) + (anyGroupTotal ? 2 : 0);
    const rangeCol = anyRange ? "Levels".padEnd(LEVELS_W) : "";

    const headerText = anyDiscount
        ? "Method".padEnd(nameW) +
          rangeCol +
          "Was".padStart(moneyW) +
          "Now".padStart(moneyW) +
          "  Save".padEnd(6)
        : "Method".padEnd(nameW) + rangeCol + "Price".padStart(moneyW);

    const lines = [header(headerText), rule(headerText.length)];

    // Discord rejects an embed whose field value exceeds 1024 characters, and
    // the ANSI colour codes count toward it. Grouped tables are long enough to
    // reach that, so rows are dropped before the limit rather than after.
    const FIELD_LIMIT = 1024;
    const FENCE = "```ansi\n\n```".length;
    let budget = FIELD_LIMIT - FENCE - lines.join("\n").length;
    let truncated = 0;

    for (let i = 0; i < options.length; i++) {
        const option = options[i];

        // Blank-line a group off from its surroundings: before a parent that
        // owns children, after the last child, and after the recommended row,
        // so a following standalone row is never mistaken for part of what
        // sits above it.
        const startsGroup = !option.isChild && options[i + 1]?.isChild;
        const followsGroup = !option.isChild && options[i - 1]?.isChild;
        const followsBest = !option.isChild && options[i - 1]?.isBest;
        if ((startsGroup || followsGroup || followsBest) && lines.length > 2) {
            lines.push("");
        }

        const isGroupTotal = Boolean(startsGroup) && !option.isBest;

        // Segment options arrive named "Falador Rooftop (50-60)"; the range has
        // its own column, so drop the suffix rather than print it twice.
        const bareName = option.range
            ? option.name.replace(/\s*\(\d+\s*-\s*\d+\)\s*$/, "").trim()
            : option.name;

        // Children carry a dash instead of a name: the level range already
        // identifies the segment, and the marker ties the row to the group
        // above it. Discord's ANSI code block font drops box-drawing glyphs,
        // so this stays ASCII rather than using a corner character.
        // clip() trims, so the indent is applied after clipping.
        const name = option.isChild
            ? `  -`.padEnd(nameW)
            : clip(bareName, nameW - 1).padEnd(nameW);
        let row = option.isBest
            ? `${CYAN}${name}${RESET}`
            : option.isChild
              ? `${DIM}${name}${RESET}`
              : name;

        if (anyRange) {
            row += `${DIM}${clip(option.range || "", LEVELS_W).padEnd(LEVELS_W)}${RESET}`;
        }

        const priceText = isGroupTotal
            ? `= ${money(option.finalPrice)}`.padStart(moneyW)
            : money(option.finalPrice).padStart(moneyW);

        const priceCell = option.isBest
            ? `${BOLD_GREEN}${priceText}${RESET}`
            : option.isChild
              ? `${DIM}${priceText}${RESET}`
              : isGroupTotal
                ? `${BOLD_YELLOW}${priceText}${RESET}`
                : `${YELLOW}${priceText}${RESET}`;

        if (anyDiscount) {
            const was =
                typeof option.originalPrice === "number" &&
                option.originalPrice > option.finalPrice
                    ? money(option.originalPrice)
                    : "";
            row += `${DIM}${was.padStart(moneyW)}${RESET}`;
            row += priceCell;
            // The percentage is identical for every row in a group, so print it
            // once on the parent rather than repeating it down the column.
            row +=
                option.discountPercent && option.discountPercent > 0 && !option.isChild
                    ? `${GREEN}${`  ${option.discountPercent}%`.padEnd(6)}${RESET}`
                    : "";
        } else {
            row += priceCell;
        }

        if (option.isBest) {
            row += " ⭐";
        }

        // A child without its parent is meaningless, so once the budget runs
        // out the rest of the table is dropped rather than half a group.
        const cost = row.length + 1;
        if (cost > budget) {
            truncated = options.length - i;
            break;
        }

        budget -= cost;
        lines.push(row);
    }

    if (truncated > 0) {
        const note = `${DIM}… ${truncated} more${RESET}`;
        // Trade the last row for the note when there is no room left for both.
        if (note.length + 1 > budget) {
            lines.pop();
        }
        lines.push(note);
    }

    return block(lines);
}

export function buildTotalBlock(
    methodName: string,
    basePrice: number,
    adjustments: AdjustmentRow[],
    finalPrice: number
): string {
    const lines: string[] = [];

    if (methodName) {
        lines.push(
            `${DIM}${"Best method".padEnd(LABEL_W)}${RESET}` +
                `${CYAN}${clip(methodName, NAME_W)}${RESET}`
        );
    }

    lines.push(
        `${DIM}${"Base price".padEnd(LABEL_W)}${RESET}` +
            `${YELLOW}${money(basePrice).padStart(MONEY_W)}${RESET}`
    );

    for (const adjustment of adjustments) {
        const suffix =
            adjustment.type === "PERCENTAGE" && typeof adjustment.value === "number"
                ? ` ${Math.abs(adjustment.value)}%`
                : "";
        const label = clip(stripEmoji(`${adjustment.label}${suffix}`), LABEL_W);
        const color = adjustment.amount < 0 ? GREEN : YELLOW;
        lines.push(
            `${DIM}${label.padEnd(LABEL_W)}${RESET}` +
                `${color}${signedMoney(adjustment.amount).padStart(MONEY_W)}${RESET}`
        );
    }

    lines.push(rule(LABEL_W + MONEY_W));
    lines.push(
        `${BOLD_GREEN}${"TOTAL".padEnd(LABEL_W)}${money(finalPrice).padStart(MONEY_W)}${RESET}`
    );

    return block(lines);
}

/**
 * Extras a customer may qualify for, listed but not charged. Rendered as a
 * table so long names cannot wrap into the ragged chips a chip list produces.
 */
export function buildExtrasTable(
    extras: Array<{ name: string; amount: string }>
): string {
    if (!extras || extras.length === 0) {
        return "";
    }

    const headerText = "Optional extra".padEnd(NAME_W + 4) + "Adds".padStart(8);
    const lines = [header(headerText), rule(headerText.length)];

    for (const extra of extras) {
        const isDiscount = extra.amount.trim().startsWith("-");
        lines.push(
            clip(extra.name, NAME_W + 3).padEnd(NAME_W + 4) +
                `${isDiscount ? GREEN : YELLOW}${extra.amount.padStart(8)}${RESET}`
        );
    }

    return block(lines);
}

export function buildGrandTotal(amount: number): string {
    return block([
        `${BOLD_GREEN}${"TOTAL".padEnd(LABEL_W)}${money(amount).padStart(MONEY_W)}${RESET}`,
    ]);
}

/**
 * Banner only. The calculator's tables are fixed-width code blocks that cannot
 * reflow, and a thumbnail steals roughly a quarter of the line width - enough
 * to wrap the price column. The banner sits below the content, so it costs no
 * horizontal room.
 */
export function applyCalculatorBranding(embed: EmbedBuilder): EmbedBuilder {
    const banner = (process.env.CALC_BANNER_URL || "").trim();
    if (banner) {
        embed.setImage(banner);
    }

    return embed;
}

/**
 * Logo in the top-right, for embeds built from plain text or fields. Those
 * reflow around it, so unlike the calculators they keep their layout.
 */
export function applyBrandThumbnail(embed: EmbedBuilder): EmbedBuilder {
    const thumbnail = (process.env.CALC_THUMBNAIL_URL || "").trim();
    if (thumbnail) {
        embed.setThumbnail(thumbnail);
    }

    return embed;
}

export function buildCalculatorEmbed(
    title: string,
    scope: string,
    options: string,
    total: string,
    footer?: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(CALC_COLOR)
        .setTimestamp();

    if (scope) {
        embed.setDescription(scope);
    }

    if (options) {
        embed.addFields({ name: "💵 Pricing Options", value: options, inline: false });
    }

    if (total) {
        embed.addFields({ name: "💰 Price Summary", value: total, inline: false });
    }

    embed.setFooter({ text: footer || "Morita Gaming Services" });

    return embed;
}

export function collectAdjustments(result: any): AdjustmentRow[] {
    const adjustments: AdjustmentRow[] = [];

    const applied = (result?.modifiers || []).filter((m: any) => m.applied);

    for (const mod of applied) {
        const value = Number(mod.value);
        const amount =
            mod.type === "PERCENTAGE"
                ? ((result?.breakdown?.subtotal ?? result?.subtotal ?? 0) * value) / 100
                : value;

        adjustments.push({
            label: mod.name,
            amount,
            type: mod.type,
            value,
        });
    }

    if (result?.loyaltyDiscount) {
        adjustments.push({
            label: `${result.loyaltyDiscount.tierEmoji} ${result.loyaltyDiscount.tierName}`,
            amount: -Math.abs(result.loyaltyDiscount.discountAmount),
            type: "PERCENTAGE",
            value: result.loyaltyDiscount.discountPercent,
        });
    }

    return adjustments;
}
