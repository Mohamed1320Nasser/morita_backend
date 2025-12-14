import { Message } from "discord.js";
import logger from "../../common/loggers";

/**
 * Tracks pricing messages and their auto-delete timeouts
 * Allows early cleanup when user dismisses or navigates away
 */
export class PricingMessageTracker {
    private static instance: PricingMessageTracker;
    private messageTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private readonly AUTO_DELETE_TIME = 10 * 60 * 1000; // 10 minutes

    private constructor() {}

    static getInstance(): PricingMessageTracker {
        if (!PricingMessageTracker.instance) {
            PricingMessageTracker.instance = new PricingMessageTracker();
        }
        return PricingMessageTracker.instance;
    }

    /**
     * Track a pricing message with auto-delete after 10 minutes
     * @param messageId Discord message ID to track
     * @param deleteCallback Function to call when auto-deleting
     */
    trackMessage(messageId: string, deleteCallback: () => Promise<void>): void {
        // Clear any existing timeout for this message
        this.clearTimeout(messageId);

        // Set new timeout for 10 minutes
        const timeout = setTimeout(async () => {
            try {
                await deleteCallback();
                logger.debug(`[PricingMessageTracker] Auto-deleted message ${messageId} after 10 minutes`);
            } catch (error) {
                logger.debug(`[PricingMessageTracker] Could not auto-delete message ${messageId}:`, error);
            } finally {
                // Remove from tracking
                this.messageTimeouts.delete(messageId);
            }
        }, this.AUTO_DELETE_TIME);

        // Store timeout
        this.messageTimeouts.set(messageId, timeout);
        logger.debug(`[PricingMessageTracker] Tracking message ${messageId} for auto-delete in 10 minutes`);
    }

    /**
     * Clear timeout for a message (user dismissed or navigated away)
     * @param messageId Discord message ID
     */
    clearTimeout(messageId: string): void {
        const timeout = this.messageTimeouts.get(messageId);
        if (timeout) {
            clearTimeout(timeout);
            this.messageTimeouts.delete(messageId);
            logger.debug(`[PricingMessageTracker] Cleared timeout for message ${messageId}`);
        }
    }

    /**
     * Clear all timeouts (e.g., on bot shutdown)
     */
    clearAllTimeouts(): void {
        for (const [messageId, timeout] of this.messageTimeouts.entries()) {
            clearTimeout(timeout);
        }
        this.messageTimeouts.clear();
        logger.info(`[PricingMessageTracker] Cleared all message timeouts`);
    }

    /**
     * Get number of tracked messages
     */
    getTrackedCount(): number {
        return this.messageTimeouts.size;
    }
}

// Export singleton instance
export const pricingMessageTracker = PricingMessageTracker.getInstance();
