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

        const headerText =
            "Skill".padEnd(NAME_W) +
            "Levels".padEnd(LEVELS_W) +
            "XP".padStart(XP_W) +
            "  " +
            "Discount";

        const row =
            `${CYAN}${clip(skillName, NAME_W - 1).padEnd(NAME_W)}${RESET}` +
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
    const nameW = anyDiscount && anyRange ? 16 : NAME_W;
    const moneyW = anyDiscount ? 9 : MONEY_W;
    const rangeCol = anyRange ? "Levels".padEnd(LEVELS_W) : "";

    const headerText = anyDiscount
        ? "Method".padEnd(nameW) +
          rangeCol +
          "Was".padStart(moneyW) +
          "Now".padStart(moneyW) +
          "  Save".padEnd(6)
        : "Method".padEnd(nameW) + rangeCol + "Price".padStart(moneyW);

    const lines = [header(headerText), rule(headerText.length)];

    for (const option of options) {
        const name = clip(option.name, nameW - 1).padEnd(nameW);
        let row = option.isBest ? `${CYAN}${name}${RESET}` : name;

        if (anyRange) {
            row += `${DIM}${clip(option.range || "", LEVELS_W).padEnd(LEVELS_W)}${RESET}`;
        }

        if (anyDiscount) {
            const was =
                typeof option.originalPrice === "number" &&
                option.originalPrice > option.finalPrice
                    ? money(option.originalPrice)
                    : "";
            row += `${DIM}${was.padStart(moneyW)}${RESET}`;
            row += option.isBest
                ? `${BOLD_GREEN}${money(option.finalPrice).padStart(moneyW)}${RESET}`
                : `${YELLOW}${money(option.finalPrice).padStart(moneyW)}${RESET}`;
            row +=
                option.discountPercent && option.discountPercent > 0
                    ? `${GREEN}${`  ${option.discountPercent}%`.padEnd(6)}${RESET}`
                    : "";
        } else {
            row += option.isBest
                ? `${BOLD_GREEN}${money(option.finalPrice).padStart(moneyW)}${RESET}`
                : `${YELLOW}${money(option.finalPrice).padStart(moneyW)}${RESET}`;
        }

        if (option.isBest) {
            row += "  ⭐";
        }

        lines.push(row);
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

export function buildGrandTotal(amount: number): string {
    return block([
        `${BOLD_GREEN}${"TOTAL".padEnd(LABEL_W)}${money(amount).padStart(MONEY_W)}${RESET}`,
    ]);
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
