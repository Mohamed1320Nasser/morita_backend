import { AttachmentBuilder, Client, EmbedBuilder, TextChannel, User } from "discord.js";
import type { TicketTranscriptResult } from "./ticketTranscript.service";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

/**
 * Posts ticket open/close entries to the ticket-logs channel, laid out as:
 *
 *   🎫 New Ticket Opened
 *   @user opened a Purchase Services ticket.
 *   Ticket   #ticket-channel
 *   User     `User Mention :` @user
 *            `User Name    :` username `[id]`
 *
 * Best effort: a logging failure never affects the ticket itself.
 */

const COLOR_OPENED = 0xfca311;
const COLOR_CLOSED = 0xed4245;

function logChannelId(): string {
    // Older setups only have the general logs channel configured
    return discordConfig.ticketLogChannelId || discordConfig.logsChannelId;
}

/** The aligned "User Mention / User Name" block. */
function userBlock(user: { id: string; username?: string | null }): string {
    return (
        `\`User Mention :\` <@${user.id}>\n` +
        `\`User Name    :\` ${user.username || "unknown"} \`[${user.id}]\``
    );
}

async function send(client: Client, embed: EmbedBuilder, files: AttachmentBuilder[] = []) {
    const channelId = logChannelId();
    if (!channelId) return;

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !(channel instanceof TextChannel)) {
            logger.warn(`[TicketLog] Ticket log channel ${channelId} not found or not a text channel`);
            return;
        }
        // Mentions inside embeds never ping; allowedMentions keeps it that way
        await channel.send({ embeds: [embed.toJSON() as any], files, allowedMentions: { parse: [] } });
    } catch (error: any) {
        logger.warn(`[TicketLog] Could not post ticket log: ${error?.message || error}`);
    }
}

function transcriptLine(t: TicketTranscriptResult | null): string {
    if (!t) return "❌ Could not be created - check the bot logs";
    const size = t.sizeBytes >= 1024 * 1024 ? `${(t.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(t.sizeBytes / 1024)} KB`;
    const parts = [`${t.messageCount} messages, ${size}`];
    parts.push(t.attachment ? "📎 attached below" : "too large to attach");
    parts.push(t.stored ? "saved in the dashboard" : "⚠️ not saved to the dashboard");
    return parts.join(" · ");
}

export async function logTicketOpened(
    client: Client,
    params: {
        channelId: string;
        user: User;
        ticketNumber: string | number;
        typeLabel: string;
        extraFields?: Array<{ name: string; value: string }>;
    }
): Promise<void> {
    const ticketNo = String(params.ticketNumber).padStart(4, "0");

    const embed = new EmbedBuilder()
        .setColor(COLOR_OPENED)
        .setTitle("🎫 New Ticket Opened")
        .setDescription(
            `<@${params.user.id}> opened ${/^[aeiou]/i.test(params.typeLabel) ? "an" : "a"} **${params.typeLabel}** ticket.`
        )
        .addFields(
            { name: "Ticket", value: `<#${params.channelId}> \`#${ticketNo}\`` },
            { name: "User", value: userBlock(params.user) },
            ...(params.extraFields || []).map(f => ({ name: f.name, value: f.value.substring(0, 1024) }))
        )
        .setFooter({ text: "Verify who you are dealing with and beware of imposters!" })
        .setTimestamp();

    await send(client, embed);
}

export async function logTicketClosed(
    client: Client,
    params: {
        channelId: string;
        ticketNumber?: string | number;
        customerDiscordId?: string | null;
        closedBy: User;
        reason?: string;
        /** undefined = transcripts not attempted; null = export failed */
        transcript?: TicketTranscriptResult | null;
    }
): Promise<void> {
    const ticketNo = params.ticketNumber !== undefined ? ` \`#${String(params.ticketNumber).padStart(4, "0")}\`` : "";

    let customer: { id: string; username?: string | null } | null = null;
    if (params.customerDiscordId) {
        const fetched = await client.users.fetch(params.customerDiscordId).catch(() => null);
        customer = { id: params.customerDiscordId, username: fetched?.username };
    }

    const embed = new EmbedBuilder()
        .setColor(COLOR_CLOSED)
        .setTitle("🔒 Ticket Closed")
        .setDescription(`<@${params.closedBy.id}> closed a ticket.`)
        .addFields(
            { name: "Ticket", value: `<#${params.channelId}>${ticketNo}` },
            ...(customer ? [{ name: "User", value: userBlock(customer) }] : []),
            { name: "Closed By", value: userBlock(params.closedBy) },
            ...(params.reason ? [{ name: "Reason", value: params.reason.substring(0, 1024) }] : []),
            ...(params.transcript !== undefined ? [{ name: "Transcript", value: transcriptLine(params.transcript) }] : [])
        )
        .setTimestamp();

    await send(client, embed, params.transcript?.attachment ? [params.transcript.attachment] : []);
}
