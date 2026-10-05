import { AttachmentBuilder, TextChannel } from "discord.js";
import { createTranscript, ExportReturnType } from "discord-html-transcripts";
import { botHttp } from "../clients/botHttp";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";
import { randomUUID } from "crypto";

// Discord's upload limit for bots on servers without boosts is 10 MB
const MAX_ATTACHMENT_BYTES = 9.5 * 1024 * 1024;

// Pieces stay under nginx's default 1 MB request body limit
const UPLOAD_PIECE_BYTES = 900 * 1024;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Sends the transcript as ordered raw-byte pieces. Waits and retries when the
 * bot API rate limit (shared with all other bot calls) answers 429.
 */
async function uploadInPieces(ticketId: string, bytes: Buffer): Promise<void> {
    const uploadId = randomUUID();
    const parts = Math.max(1, Math.ceil(bytes.length / UPLOAD_PIECE_BYTES));

    for (let part = 0; part < parts; part++) {
        const piece = bytes.subarray(part * UPLOAD_PIECE_BYTES, (part + 1) * UPLOAD_PIECE_BYTES);

        for (let attempt = 1; ; attempt++) {
            try {
                await botHttp.post(`${discordConfig.apiBaseUrl}/discord/tickets/${ticketId}/transcript`, piece, {
                    params: { uploadId, part, parts, offset: part * UPLOAD_PIECE_BYTES },
                    headers: { "Content-Type": "application/octet-stream" },
                    maxBodyLength: Infinity,
                    timeout: 60000,
                });
                break;
            } catch (error: any) {
                const status = error?.response?.status;
                const retryable = status === 429 || status >= 500 || !error?.response;
                if (!retryable || attempt >= 4) throw error;
                const waitSeconds = Number(error?.response?.data?.retryAfter) || attempt * 5;
                await sleep(Math.min(waitSeconds, 60) * 1000);
            }
        }
    }
}

export interface TicketTranscriptResult {
    /** Saved to the backend (viewable from the dashboard) */
    stored: boolean;
    /** File to attach to the ticket-logs message, or null if too large / failed */
    attachment: AttachmentBuilder | null;
    messageCount: number;
    sizeBytes: number;
}

/**
 * Exports the whole ticket channel as a self-contained HTML page (images
 * embedded, no external scripts) and saves it to the backend, so the chat
 * survives the channel being deleted after it is archived.
 *
 * Never throws: a transcript failure must not block closing the ticket.
 */
export async function createTicketTranscript(
    channel: TextChannel,
    ticket: { id: string; ticketNumber?: number | string }
): Promise<TicketTranscriptResult | null> {
    const ticketNo = String(ticket.ticketNumber ?? "").padStart(4, "0");
    const fileName = `ticket-${ticketNo}-transcript.html`;

    let html: string;
    try {
        html = await createTranscript(channel, {
            limit: -1, // whole conversation
            returnType: ExportReturnType.String,
            saveImages: true, // Discord image links expire; embed them so the backup keeps working
            hydrate: true, // render server-side: the file opens offline, no CDN scripts
            poweredBy: false,
            filename: fileName,
            footerText: `Ticket #${ticketNo} - exported {number} message{s}.`,
        });
    } catch (error: any) {
        logger.error(`[TicketTranscript] Could not export ticket #${ticketNo}: ${error?.message || error}`);
        return null;
    }

    const sizeBytes = Buffer.byteLength(html, "utf8");
    const messageCount = Number(html.match(/exported (\d+) message/)?.[1] || 0);

    let stored = false;
    try {
        await uploadInPieces(ticket.id, Buffer.from(html, "utf8"));
        stored = true;
    } catch (error: any) {
        logger.error(
            `[TicketTranscript] Could not save transcript for ticket #${ticketNo}: ` +
                `${error?.response?.status || ""} ${error?.response?.data?.msg || error?.message}`
        );
    }

    const attachment =
        sizeBytes <= MAX_ATTACHMENT_BYTES
            ? new AttachmentBuilder(Buffer.from(html, "utf8"), { name: fileName })
            : null;

    logger.info(
        `[TicketTranscript] Ticket #${ticketNo}: ${Math.round(sizeBytes / 1024)} KB, ` +
            `stored=${stored}, attached=${attachment !== null}`
    );

    return { stored, attachment, messageCount, sizeBytes };
}
