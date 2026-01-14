import { Message } from "discord.js";
import logger from "../../common/loggers";

export class PricingMessageTracker {
    private static instance: PricingMessageTracker;
    private messageTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private readonly AUTO_DELETE_TIME = 10 * 60 * 1000; 

    private constructor() {}

    static getInstance(): PricingMessageTracker {
        if (!PricingMessageTracker.instance) {
            PricingMessageTracker.instance = new PricingMessageTracker();
        }
        return PricingMessageTracker.instance;
    }

    trackMessage(messageId: string, deleteCallback: () => Promise<void>): void {
        
        this.clearTimeout(messageId);

        const timeout = setTimeout(async () => {
            try {
                await deleteCallback();
                logger.debug(`[PricingMessageTracker] Auto-deleted message ${messageId} after 10 minutes`);
            } catch (error) {
                logger.debug(`[PricingMessageTracker] Could not auto-delete message ${messageId}:`, error);
            } finally {
                
                this.messageTimeouts.delete(messageId);
            }
        }, this.AUTO_DELETE_TIME);

        this.messageTimeouts.set(messageId, timeout);
        logger.debug(`[PricingMessageTracker] Tracking message ${messageId} for auto-delete in 10 minutes`);
    }

    clearTimeout(messageId: string): void {
        const timeout = this.messageTimeouts.get(messageId);
        if (timeout) {
            clearTimeout(timeout);
            this.messageTimeouts.delete(messageId);
            logger.debug(`[PricingMessageTracker] Cleared timeout for message ${messageId}`);
        }
    }

    clearAllTimeouts(): void {
        for (const [messageId, timeout] of this.messageTimeouts.entries()) {
            clearTimeout(timeout);
        }
        this.messageTimeouts.clear();
        logger.info(`[PricingMessageTracker] Cleared all message timeouts`);
    }

    getTrackedCount(): number {
        return this.messageTimeouts.size;
    }
}

export const pricingMessageTracker = PricingMessageTracker.getInstance();
