import { Client, TextChannel } from "discord.js";
import { discordConfig } from "../config/discord.config";
import logger from "../../common/loggers";

interface PendingMove {
    channelId: string;
    ticketId: string;
    retryCount: number;
    scheduledAt: number;
}

export class TicketChannelMoverService {
    private client: Client;
    private pendingMoves: Map<string, PendingMove> = new Map();
    private moveInterval: NodeJS.Timeout | null = null;
    private readonly MAX_RETRIES = 5;
    private readonly RETRY_DELAY = 10000; // 10 seconds

    constructor(client: Client) {
        this.client = client;
        this.startMoveProcessor();
    }

    queueMove(channelId: string, ticketId: string): void {
        this.pendingMoves.set(channelId, {
            channelId,
            ticketId,
            retryCount: 0,
            scheduledAt: Date.now() + 5000, // Move after 5 seconds
        });

        logger.info(`[TicketMover] Queued channel ${channelId} for move`);
    }

    private startMoveProcessor(): void {
        this.moveInterval = setInterval(() => {
            this.processPendingMoves();
        }, 5000);
    }

    private async processPendingMoves(): Promise<void> {
        const now = Date.now();
        const movesToProcess = Array.from(this.pendingMoves.values())
            .filter(move => move.scheduledAt <= now);

        for (const move of movesToProcess) {
            await this.attemptMove(move);
        }
    }

    private async attemptMove(move: PendingMove): Promise<void> {
        try {
            const guild = this.client.guilds.cache.get(discordConfig.guildId);
            if (!guild) {
                this.pendingMoves.delete(move.channelId);
                return;
            }

            const channel = guild.channels.cache.get(move.channelId);
            if (!channel || !(channel instanceof TextChannel)) {
                this.pendingMoves.delete(move.channelId);
                return;
            }

            const closedCategory = guild.channels.cache.get(discordConfig.closedTicketsCategoryId);
            if (!closedCategory) {
                logger.warn(`[TicketMover] Closed category not found`);
                this.scheduleRetry(move);
                return;
            }

            await channel.setParent(closedCategory.id, { lockPermissions: false });

            logger.info(`[TicketMover] Moved ${channel.name} to closed category`);
            this.pendingMoves.delete(move.channelId);

        } catch (error: any) {
            logger.error(`[TicketMover] Move failed: ${error.message}`);
            this.scheduleRetry(move);
        }
    }

    private scheduleRetry(move: PendingMove): void {
        if (move.retryCount >= this.MAX_RETRIES) {
            logger.error(`[TicketMover] Max retries reached for ${move.channelId}`);
            this.pendingMoves.delete(move.channelId);
            return;
        }

        move.retryCount++;
        move.scheduledAt = Date.now() + this.RETRY_DELAY;
        this.pendingMoves.set(move.channelId, move);

        logger.info(`[TicketMover] Retry ${move.retryCount}/${this.MAX_RETRIES} scheduled`);
    }

    getPendingCount(): number {
        return this.pendingMoves.size;
    }

    stop(): void {
        if (this.moveInterval) {
            clearInterval(this.moveInterval);
            this.moveInterval = null;
        }
    }
}

let ticketChannelMoverInstance: TicketChannelMoverService | null = null;

export function getTicketChannelMover(client: Client): TicketChannelMoverService {
    if (!ticketChannelMoverInstance) {
        ticketChannelMoverInstance = new TicketChannelMoverService(client);
    }
    return ticketChannelMoverInstance;
}
