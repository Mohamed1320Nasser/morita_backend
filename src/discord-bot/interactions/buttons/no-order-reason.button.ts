import { ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, EmbedBuilder } from "discord.js";
import logger from "../../../common/loggers";
import { discordApiClient } from "../../clients/DiscordApiClient";
import { isAdminOrSupport } from "../../utils/role-check.util";
import { unwrapApiData } from "../../utils/apiResponse.util";
import { NO_ORDER_REASONS, NoOrderReason } from "../../../common/constants/noOrderReasons.constants";

const PREFIX = "no_order_reason_";

/**
 * Posted in a ticket that closed without an order (KPI plan, Feature 2):
 * support picks why, which feeds KPIs > Support > Ticket → Order Conversion.
 */
export function buildNoOrderReasonPrompt(ticketId: string) {
    const embed = new EmbedBuilder()
        .setTitle("❓ Why no order?")
        .setDescription("This ticket closed without an order. Support: pick the reason (one click).")
        .setColor(0x95a5a6);

    const buttons = (Object.keys(NO_ORDER_REASONS) as NoOrderReason[]).map((reason) =>
        new ButtonBuilder()
            .setCustomId(`${PREFIX}${ticketId}_${reason}`)
            .setLabel(NO_ORDER_REASONS[reason])
            .setStyle(reason === "OTHER" ? ButtonStyle.Secondary : ButtonStyle.Primary)
    );

    // Discord allows 5 buttons per row
    const rows = [buttons.slice(0, 5), buttons.slice(5)]
        .filter((row) => row.length > 0)
        .map((row) => new ActionRowBuilder<ButtonBuilder>().addComponents(row));

    return { embeds: [embed.toJSON() as any], components: rows.map((r) => r.toJSON() as any) };
}

export async function handleNoOrderReasonButton(interaction: ButtonInteraction): Promise<void> {
    // customId: no_order_reason_<ticketId>_<REASON>; reasons contain "_" too
    const rest = interaction.customId.slice(PREFIX.length);
    const reason = (Object.keys(NO_ORDER_REASONS) as NoOrderReason[]).find((r) => rest.endsWith(`_${r}`));
    const ticketId = reason ? rest.slice(0, rest.length - reason.length - 1) : "";

    if (!reason || !ticketId) {
        await interaction.reply({ content: "❌ Unknown reason button.", ephemeral: true });
        return;
    }

    if (!(await isAdminOrSupport(interaction.client, interaction.user.id))) {
        await interaction.reply({ content: "❌ Only support or admins can set the reason.", ephemeral: true });
        return;
    }

    try {
        const response: any = await discordApiClient.post(`/discord/tickets/${ticketId}/no-order-reason`, {
            reason,
            discordId: interaction.user.id,
        });
        const result = unwrapApiData<any>(response);
        const label = result?.label || NO_ORDER_REASONS[reason];

        // Lock the buttons so the prompt shows the answer
        const embed = new EmbedBuilder()
            .setTitle("❓ Why no order?")
            .setDescription(
                result?.alreadySet
                    ? `Already recorded: **${label}**`
                    : `Recorded: **${label}** by <@${interaction.user.id}>`
            )
            .setColor(0x2ecc71);

        await interaction.update({ embeds: [embed.toJSON() as any], components: [] });
        logger.info(`[NoOrderReason] Ticket ${ticketId}: ${reason} by ${interaction.user.tag}`);
    } catch (error: any) {
        const message = error?.response?.data?.msg || error?.message || "Could not save the reason";
        logger.error(`[NoOrderReason] Ticket ${ticketId}: ${message}`);
        await interaction.reply({ content: `❌ ${message}`, ephemeral: true }).catch(() => {});
    }
}
