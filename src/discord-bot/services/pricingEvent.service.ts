import * as events from "node:events";
import logger from "../../common/loggers";

/**
 * Event types for pricing system updates
 */
export enum PricingEventType {
    CATEGORY_CREATED = "category:created",
    CATEGORY_UPDATED = "category:updated",
    CATEGORY_DELETED = "category:deleted",
    SERVICE_CREATED = "service:created",
    SERVICE_UPDATED = "service:updated",
    SERVICE_DELETED = "service:deleted",
    PRICING_METHOD_CREATED = "pricing_method:created",
    PRICING_METHOD_UPDATED = "pricing_method:updated",
    PRICING_METHOD_DELETED = "pricing_method:deleted",
    PRICING_MODIFIER_CREATED = "pricing_modifier:created",
    PRICING_MODIFIER_UPDATED = "pricing_modifier:updated",
    PRICING_MODIFIER_DELETED = "pricing_modifier:deleted",
}

/**
 * Event data interface
 */
export interface PricingEventData {
    type: PricingEventType;
    entityId: string;
    entityType: "category" | "service" | "pricing_method" | "pricing_modifier";
    timestamp: Date;
    data?: any;
}

/**
 * Pricing Event Service
 * Handles real-time events for pricing system changes
 * Uses composition instead of inheritance for better TypeScript compatibility
 */
export class PricingEventService {
    private static instance: PricingEventService;
    private eventEmitter: any;

    private constructor() {
        this.eventEmitter = new events.EventEmitter();
        this.eventEmitter.setMaxListeners(20); // Increase for multiple listeners
    }

    /**
     * Get singleton instance
     */
    static getInstance(): PricingEventService {
        if (!PricingEventService.instance) {
            PricingEventService.instance = new PricingEventService();
        }
        return PricingEventService.instance;
    }

    /**
     * Emit a pricing event
     */
    emitPricingEvent(eventData: PricingEventData): void {
        logger.info(
            `[PricingEvent] Emitting: ${eventData.type} for ${eventData.entityType} ${eventData.entityId}`
        );
        this.eventEmitter.emit(eventData.type, eventData);
        this.eventEmitter.emit("pricing:change", eventData); // Generic change event
    }

    /**
     * Subscribe to specific event type
     */
    onPricingEvent(
        eventType: PricingEventType | "pricing:change",
        handler: (eventData: PricingEventData) => void | Promise<void>
    ): void {
        this.eventEmitter.on(eventType, async (eventData: PricingEventData) => {
            try {
                await handler(eventData);
            } catch (error) {
                logger.error(
                    `Error handling pricing event ${eventType}:`,
                    error
                );
            }
        });
    }

    /**
     * Unsubscribe from event
     */
    offPricingEvent(
        eventType: PricingEventType | "pricing:change",
        handler: (eventData: PricingEventData) => void | Promise<void>
    ): void {
        this.eventEmitter.off(eventType, handler);
    }

    /**
     * Helper: Emit category event
     */
    emitCategoryEvent(
        action: "created" | "updated" | "deleted",
        categoryId: string,
        data?: any
    ): void {
        const eventType =
            action === "created"
                ? PricingEventType.CATEGORY_CREATED
                : action === "updated"
                  ? PricingEventType.CATEGORY_UPDATED
                  : PricingEventType.CATEGORY_DELETED;

        this.emitPricingEvent({
            type: eventType,
            entityId: categoryId,
            entityType: "category",
            timestamp: new Date(),
            data,
        });
    }

    /**
     * Helper: Emit service event
     */
    emitServiceEvent(
        action: "created" | "updated" | "deleted",
        serviceId: string,
        categoryId?: string,
        data?: any
    ): void {
        const eventType =
            action === "created"
                ? PricingEventType.SERVICE_CREATED
                : action === "updated"
                  ? PricingEventType.SERVICE_UPDATED
                  : PricingEventType.SERVICE_DELETED;

        this.emitPricingEvent({
            type: eventType,
            entityId: serviceId,
            entityType: "service",
            timestamp: new Date(),
            data: { ...data, categoryId },
        });
    }

    /**
     * Helper: Emit pricing method event
     */
    emitPricingMethodEvent(
        action: "created" | "updated" | "deleted",
        methodId: string,
        serviceId?: string,
        data?: any
    ): void {
        const eventType =
            action === "created"
                ? PricingEventType.PRICING_METHOD_CREATED
                : action === "updated"
                  ? PricingEventType.PRICING_METHOD_UPDATED
                  : PricingEventType.PRICING_METHOD_DELETED;

        this.emitPricingEvent({
            type: eventType,
            entityId: methodId,
            entityType: "pricing_method",
            timestamp: new Date(),
            data: { ...data, serviceId },
        });
    }

    /**
     * Helper: Emit pricing modifier event
     */
    emitPricingModifierEvent(
        action: "created" | "updated" | "deleted",
        modifierId: string,
        methodId?: string,
        data?: any
    ): void {
        const eventType =
            action === "created"
                ? PricingEventType.PRICING_MODIFIER_CREATED
                : action === "updated"
                  ? PricingEventType.PRICING_MODIFIER_UPDATED
                  : PricingEventType.PRICING_MODIFIER_DELETED;

        this.emitPricingEvent({
            type: eventType,
            entityId: modifierId,
            entityType: "pricing_modifier",
            timestamp: new Date(),
            data: { ...data, methodId },
        });
    }
}

// Export singleton instance
export const pricingEventService = PricingEventService.getInstance();
