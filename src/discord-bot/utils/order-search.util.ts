import logger from "../../common/loggers";
import { discordApiClient } from "../clients/DiscordApiClient";

/**
 * Find order by order number
 * Shared utility to avoid DRY violations across commands
 */
export async function findOrderByNumber(orderNumber: string): Promise<{
    orderId: string;
    orderData: any;
} | null> {
    try {
        // Validate order number is a positive integer
        if (!/^\d+$/.test(orderNumber)) {
            throw new Error("Order number must be a positive integer");
        }

        const orderNum = parseInt(orderNumber);
        if (orderNum <= 0) {
            throw new Error("Order number must be greater than 0");
        }

        logger.info(`[OrderSearch] Getting order by number: ${orderNumber}`);

        // Use dedicated endpoint to get order by number (more efficient than search)
        const response: any = await discordApiClient.get(
            `/discord/orders/number/${orderNumber}`
        );

        const orderData = response.data || response;
        const orderId = orderData.id;

        logger.info(`[OrderSearch] Found order ID: ${orderId} for order #${orderNumber}`);

        return { orderId, orderData };
    } catch (error: any) {
        // Check if it's a 404 not found error
        if (error?.response?.status === 404 || error?.message?.includes("not found")) {
            logger.warn(`[OrderSearch] Order not found: ${orderNumber}`);
            return null;
        }

        logger.error("[OrderSearch] Error getting order:", error);
        throw error;
    }
}
