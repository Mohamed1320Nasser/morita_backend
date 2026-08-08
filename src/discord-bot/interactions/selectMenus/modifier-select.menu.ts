import {
    StringSelectMenuInteraction,
    ButtonInteraction,
    EmbedBuilder,
} from "discord.js";
import PricingCalculatorService from "../../../api/pricingCalculator/pricingCalculator.service";
import LoyaltyTierService from "../../../api/loyalty-tier/loyalty-tier.service";
import prisma from "../../../common/prisma/client";
import logger from "../../../common/loggers";
import {
    MODIFIER_SELECT_PREFIX,
    MODIFIER_RESET_PREFIX,
    buildModifierBadges,
    buildAppliedSummary,
    buildModifierSelectRow,
    buildModifierResetRow,
    formatModifierValue,
    SelectableModifier,
} from "../../utils/modifierSelector";
import {
    getSelectionState,
    updateSelectedIds,
} from "../../services/modifierSelection.service";

const pricingService = new PricingCalculatorService(new LoyaltyTierService());

// Fixed column widths keep the price block the same size in every state and
// stop the embed rendering narrower than the select menu beneath it.
const PRICE_LABEL_WIDTH = 22;
const PRICE_AMOUNT_WIDTH = 12;

const EXPIRED_MESSAGE =
    "⏱️ This calculation has expired. Please run the calculator again.";

export async function handleModifierSelect(
    interaction: StringSelectMenuInteraction
): Promise<void> {
    const token = interaction.customId.replace(MODIFIER_SELECT_PREFIX, "");
    await applySelection(interaction, token, interaction.values);
}

export async function handleModifierReset(
    interaction: ButtonInteraction
): Promise<void> {
    const token = interaction.customId.replace(MODIFIER_RESET_PREFIX, "");
    await applySelection(interaction, token, []);
}

async function applySelection(
    interaction: StringSelectMenuInteraction | ButtonInteraction,
    token: string,
    selectedIds: string[]
): Promise<void> {
    // Acknowledge first: Discord only allows 3 seconds, and the lookups below
    // (cache + database + price calculation) can exceed that.
    //
    // If the acknowledgement itself is too late the token is dead, so fall back
    // to editing the message directly - the customer still sees the new price
    // instead of a stale one with no explanation.
    let acknowledged = true;

    try {
        await interaction.deferUpdate();
    } catch (deferError) {
        acknowledged = false;
        logger.warn(
            `[ModifierSelect] Could not acknowledge in time for ${token}, ` +
                `falling back to a direct message edit`
        );
    }

    try {
        const existing = await getSelectionState(token);

        if (!existing) {
            if (acknowledged) {
                await interaction.followUp({ content: EXPIRED_MESSAGE, ephemeral: true });
            }
            return;
        }

        // Only the person who ran the calculator may change its options.
        if (existing.userId !== interaction.user.id) {
            if (acknowledged) {
                await interaction.followUp({
                    content:
                        "This calculation belongs to another user. Run the calculator yourself to pick options.",
                    ephemeral: true,
                });
            }
            return;
        }

        const state = await updateSelectedIds(token, selectedIds);
        if (!state || !state.methodId || !state.paymentMethodId) {
            if (acknowledged) {
                await interaction.followUp({ content: EXPIRED_MESSAGE, ephemeral: true });
            }
            return;
        }

        const method = await prisma.pricingMethod.findUnique({
            where: { id: state.methodId },
            include: {
                modifiers: { where: { active: true }, orderBy: { priority: "asc" } },
                service: { select: { name: true, emoji: true } },
            },
        });

        if (!method) {
            if (acknowledged) {
                await interaction.followUp({ content: EXPIRED_MESSAGE, ephemeral: true });
            }
            return;
        }

        const result = await pricingService.calculatePrice({
            methodId: state.methodId,
            paymentMethodId: state.paymentMethodId,
            quantity: state.quantity || 1,
            methodModifierIds: selectedIds,
            userId: state.dbUserId,
        });

        const available: SelectableModifier[] = method.modifiers.map(m => ({
            id: m.id,
            name: m.name,
            type: m.modifierType,
            displayType: m.displayType,
            value: Number(m.value),
        }));

        const embed = buildResultEmbed(
            state.serviceEmoji || method.service.emoji || "⭐",
            method.service.name,
            state.serviceName || method.name,
            state.quantity || 1,
            result,
            available,
            selectedIds
        );

        const components: any[] = [];
        const selectRow = buildModifierSelectRow(token, available, selectedIds);
        if (selectRow) components.push(selectRow);
        const resetRow = buildModifierResetRow(token, selectedIds);
        if (resetRow) components.push(resetRow);

        if (acknowledged) {
            await interaction.editReply({
                embeds: [embed.toJSON() as any],
                components,
            });
        } else if (interaction.message) {
            await interaction.message.edit({
                embeds: [embed.toJSON() as any],
                components,
            });
        }

        logger.info(
            `[ModifierSelect] ${interaction.user.tag} updated options on ${token}: ` +
                `${selectedIds.length} selected -> $${result.finalPrice.toFixed(2)}`
        );
    } catch (error: any) {
        logger.error("[ModifierSelect] Error applying selection:", error);

        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "Could not update the price. Please run the calculator again.",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "Could not update the price. Please run the calculator again.",
                    ephemeral: true,
                });
            }
        } catch (replyError) {
            logger.debug("[ModifierSelect] Could not deliver error notice:", replyError);
        }
    }
}

export function buildResultEmbed(
    serviceEmoji: string,
    serviceName: string,
    methodName: string,
    quantity: number,
    result: any,
    available: SelectableModifier[],
    selectedIds: string[]
): EmbedBuilder {
    const loyalty = result.loyaltyDiscount;
    const subtotal = result.breakdown?.subtotal ?? result.finalPrice;
    const modifiersTotal = result.breakdown?.methodModifiersTotal ?? 0;
    const hasAdjustments = modifiersTotal !== 0 || Boolean(loyalty);

    const embed = new EmbedBuilder()
        .setTitle(`${serviceEmoji} ${methodName}`)
        .setColor(0xfca311)
        .setTimestamp();

    // Options sit directly under the title, matching the reference layout:
    //   `✅ Level 5 of BA roles +$38.00`
    const badges = buildModifierBadges(available, selectedIds);
    if (badges) {
        embed.setDescription(badges);
    }

    // Only show a breakdown when something actually changed the price;
    // otherwise a single bold figure keeps the base quote clean.
    if (!hasAdjustments) {
        const amount = `$${result.finalPrice.toFixed(2)}`;
        embed.addFields({
            name: "\u{1F4B5} Price",
            value:
                "```\n" +
                `${"Total".padEnd(PRICE_LABEL_WIDTH)}  ${amount.padStart(PRICE_AMOUNT_WIDTH)}\n` +
                "```",
            inline: false,
        });
    } else {
        const rows: Array<[string, string]> = [["Base price", `$${subtotal.toFixed(2)}`]];

        if (modifiersTotal !== 0) {
            const sign = modifiersTotal > 0 ? "+" : "-";
            rows.push(["Selected options", `${sign}$${Math.abs(modifiersTotal).toFixed(2)}`]);
        }

        if (loyalty) {
            rows.push([
                `Loyalty ${loyalty.discountPercent}%`,
                `-$${loyalty.discountAmount.toFixed(2)}`,
            ]);
        }

        const labelWidth = PRICE_LABEL_WIDTH;
        const lines = rows.map(
            ([label, amount]) =>
                `${label.padEnd(labelWidth)}  ${amount.padStart(PRICE_AMOUNT_WIDTH)}`
        );

        embed.addFields({
            name: "\u{1F4B5} Price",
            value:
                "```\n" +
                lines.join("\n") +
                "\n" +
                "-".repeat(labelWidth + PRICE_AMOUNT_WIDTH + 2) +
                "\n" +
                `${"Total".padEnd(labelWidth)}  ${`$${result.finalPrice.toFixed(2)}`.padStart(PRICE_AMOUNT_WIDTH)}\n` +
                "```",
            inline: false,
        });
    }

    embed.setFooter({
        text:
            selectedIds.length > 0
                ? `${selectedIds.length} option${selectedIds.length === 1 ? "" : "s"} applied \u00b7 change them below`
                : "Select any options that apply to you",
    });

    return embed;
}

export { formatModifierValue };
