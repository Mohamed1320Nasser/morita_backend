import { PrismaClient } from "@prisma/client";
import { pricingEventService } from "../../../discord-bot/services/pricingEvent.service";
import logger from "../../loggers";

// Emit pricing events for Discord real-time updates
function emitPricingEvents(
    model: string,
    operation: string,
    args: any,
    result: any
) {
    try {
        const eventAction =
            operation === "create"
                ? "created"
                : operation === "update"
                  ? "updated"
                  : operation === "delete"
                    ? "deleted"
                    : null;

        if (!eventAction) return;

        let entityId: string | undefined;

        switch (model) {
            case "ServiceCategory":
                entityId =
                    operation === "create" ? result?.id : args?.where?.id;
                if (entityId) {
                    logger.debug(
                        `[PrismaEvent] Category ${eventAction}: ${entityId}`
                    );
                    pricingEventService.emitCategoryEvent(
                        eventAction as any,
                        entityId,
                        operation !== "delete" ? result : undefined
                    );
                }
                break;

            case "Service":
                entityId =
                    operation === "create" ? result?.id : args?.where?.id;
                const categoryId = result?.categoryId || args?.data?.categoryId;
                if (entityId) {
                    logger.debug(
                        `[PrismaEvent] Service ${eventAction}: ${entityId}`
                    );
                    pricingEventService.emitServiceEvent(
                        eventAction as any,
                        entityId,
                        categoryId,
                        operation !== "delete" ? result : undefined
                    );
                }
                break;

            case "PricingMethod":
                entityId =
                    operation === "create" ? result?.id : args?.where?.id;
                const serviceId = result?.serviceId || args?.data?.serviceId;
                if (entityId) {
                    logger.debug(
                        `[PrismaEvent] PricingMethod ${eventAction}: ${entityId}`
                    );
                    pricingEventService.emitPricingMethodEvent(
                        eventAction as any,
                        entityId,
                        serviceId,
                        operation !== "delete" ? result : undefined
                    );
                }
                break;

            case "PricingModifier":
                entityId =
                    operation === "create" ? result?.id : args?.where?.id;
                const methodId = result?.methodId || args?.data?.methodId;
                if (entityId) {
                    logger.debug(
                        `[PrismaEvent] PricingModifier ${eventAction}: ${entityId}`
                    );
                    pricingEventService.emitPricingModifierEvent(
                        eventAction as any,
                        entityId,
                        methodId,
                        operation !== "delete" ? result : undefined
                    );
                }
                break;
        }
    } catch (error) {
        logger.error("[PrismaEvent] Error emitting pricing event:", error);
    }
}

// Create Prisma client with connection pooling and extensions
const prisma = new PrismaClient({
    log: ['error'], // Only log errors
    // Connection pooling is configured via DATABASE_URL parameters
    // See .env.example for connection pool configuration
}).$extends({
    query: {
        $allModels: {
            async $allOperations({ model, operation, args, query }) {
                // Execute the query
                const result = await query(args);

                // Emit pricing events for real-time Discord updates
                if (
                    operation === "create" ||
                    operation === "update" ||
                    operation === "delete"
                ) {
                    emitPricingEvents(model, operation, args, result);
                }

                return result;
            },
        },
    },
});

export default prisma;
