import { Prisma } from "@prisma/client";
import { pricingEventService } from "../../discord-bot/services/pricingEvent.service";
import logger from "../loggers";

// Type definitions for Prisma middleware (compatible with Prisma v4+)
type MiddlewareParams = {
    model?: string;
    action: string;
    args: any;
    dataPath: string[];
    runInTransaction: boolean;
};

type Middleware = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => Promise<any>
) => Promise<any>;

/**
 * Prisma middleware to emit events when pricing-related data changes
 * This enables real-time Discord updates without polling
 */
export function pricingEventMiddleware(): Middleware {
    return async (params: MiddlewareParams, next) => {
        const result = await next(params);

        // Only emit events for successful write operations
        if (
            params.action === "create" ||
            params.action === "update" ||
            params.action === "delete" ||
            params.action === "deleteMany" ||
            params.action === "updateMany"
        ) {
            try {
                await emitEventForModel(params, result);
            } catch (error) {
                logger.error("Error emitting pricing event:", error);
                // Don't fail the database operation if event emission fails
            }
        }

        return result;
    };
}

/**
 * Emit appropriate event based on model and action
 */
async function emitEventForModel(
    params: MiddlewareParams,
    result: any
): Promise<void> {
    const model = params.model;
    const action = params.action;

    // Map Prisma action to our event action
    const eventAction =
        action === "create"
            ? "created"
            : action === "update"
              ? "updated"
              : "deleted";

    switch (model) {
        case "ServiceCategory":
            await handleCategoryEvent(
                eventAction as any,
                params,
                result
            );
            break;

        case "Service":
            await handleServiceEvent(eventAction as any, params, result);
            break;

        case "PricingMethod":
            await handlePricingMethodEvent(
                eventAction as any,
                params,
                result
            );
            break;

        case "PricingModifier":
            await handlePricingModifierEvent(
                eventAction as any,
                params,
                result
            );
            break;

        default:
            // Ignore other models
            break;
    }
}

/**
 * Handle ServiceCategory events
 */
async function handleCategoryEvent(
    action: "created" | "updated" | "deleted",
    params: MiddlewareParams,
    result: any
): Promise<void> {
    let categoryId: string | undefined;

    if (action === "created") {
        categoryId = result?.id;
    } else if (action === "updated" || action === "deleted") {
        categoryId = params.args?.where?.id;
    }

    if (categoryId) {
        logger.debug(
            `[PricingEventMiddleware] Category ${action}: ${categoryId}`
        );
        pricingEventService.emitCategoryEvent(
            action,
            categoryId,
            action === "created" || action === "updated" ? result : undefined
        );
    }
}

/**
 * Handle Service events
 */
async function handleServiceEvent(
    action: "created" | "updated" | "deleted",
    params: MiddlewareParams,
    result: any
): Promise<void> {
    let serviceId: string | undefined;
    let categoryId: string | undefined;

    if (action === "created") {
        serviceId = result?.id;
        categoryId = result?.categoryId;
    } else if (action === "updated" || action === "deleted") {
        serviceId = params.args?.where?.id;
        categoryId = result?.categoryId || params.args?.data?.categoryId;
    }

    if (serviceId) {
        logger.debug(
            `[PricingEventMiddleware] Service ${action}: ${serviceId}`
        );
        pricingEventService.emitServiceEvent(
            action,
            serviceId,
            categoryId,
            action === "created" || action === "updated" ? result : undefined
        );
    }
}

/**
 * Handle PricingMethod events
 */
async function handlePricingMethodEvent(
    action: "created" | "updated" | "deleted",
    params: MiddlewareParams,
    result: any
): Promise<void> {
    let methodId: string | undefined;
    let serviceId: string | undefined;

    if (action === "created") {
        methodId = result?.id;
        serviceId = result?.serviceId;
    } else if (action === "updated" || action === "deleted") {
        methodId = params.args?.where?.id;
        serviceId = result?.serviceId || params.args?.data?.serviceId;
    }

    if (methodId) {
        logger.debug(
            `[PricingEventMiddleware] PricingMethod ${action}: ${methodId}`
        );
        pricingEventService.emitPricingMethodEvent(
            action,
            methodId,
            serviceId,
            action === "created" || action === "updated" ? result : undefined
        );
    }
}

/**
 * Handle PricingModifier events
 */
async function handlePricingModifierEvent(
    action: "created" | "updated" | "deleted",
    params: MiddlewareParams,
    result: any
): Promise<void> {
    let modifierId: string | undefined;
    let methodId: string | undefined;

    if (action === "created") {
        modifierId = result?.id;
        methodId = result?.methodId;
    } else if (action === "updated" || action === "deleted") {
        modifierId = params.args?.where?.id;
        methodId = result?.methodId || params.args?.data?.methodId;
    }

    if (modifierId) {
        logger.debug(
            `[PricingEventMiddleware] PricingModifier ${action}: ${modifierId}`
        );
        pricingEventService.emitPricingModifierEvent(
            action,
            modifierId,
            methodId,
            action === "created" || action === "updated" ? result : undefined
        );
    }
}
