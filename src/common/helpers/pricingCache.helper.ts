import prisma from "../prisma/client";
import { getRedisService } from "../services/redis.service";
import logger from "../loggers";

/**
 * Drop every cached quote for a service.
 *
 * Level-range quotes carry the service in the key. Single-method quotes are
 * keyed by method, so the service's methods have to be resolved first.
 *
 * Lives here rather than on the calculator service so the pricing method and
 * modifier services can call it without importing each other.
 */
export async function invalidatePricingCache(serviceId: string): Promise<number> {
    try {
        const redis = getRedisService();

        const methods = await prisma.pricingMethod.findMany({
            where: { serviceId },
            select: { id: true },
        });

        const patterns = [
            `pricing:range:${serviceId}:*`,
            ...methods.map(method => `pricing:calc:${method.id}:*`),
        ];

        let removed = 0;
        for (const pattern of patterns) {
            removed += await redis.deleteByPattern(pattern);
        }

        if (removed > 0) {
            logger.info(
                `[PricingCache] Cleared ${removed} cached quote(s) for service ${serviceId}`
            );
        }

        return removed;
    } catch (error) {
        logger.error(`[PricingCache] Failed clearing cache for service ${serviceId}:`, error);
        return 0;
    }
}

/**
 * Same, but starting from a method id when the service is not to hand.
 */
export async function invalidatePricingCacheForMethod(methodId: string): Promise<number> {
    const method = await prisma.pricingMethod.findUnique({
        where: { id: methodId },
        select: { serviceId: true },
    });

    if (!method) return 0;
    return invalidatePricingCache(method.serviceId);
}
