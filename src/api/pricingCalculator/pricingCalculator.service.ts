import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { getXpBetweenLevels, formatXp } from "../../common/utils/xpCalculator";
import logger from "../../common/loggers";
import { getRedisService } from "../../common/services/redis.service";

export interface PriceCalculationRequest {
    methodId: string;
    paymentMethodId: string;
    quantity?: number; // For PER_LEVEL, PER_KILL, PER_ITEM, PER_HOUR
    serviceModifierIds?: string[]; // Selected service-level modifier IDs
    customConditions?: Record<string, any>; // For modifier conditions
}

export interface PriceCalculationResult {
    basePrice: number;
    finalPrice: number;
    serviceModifiers: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
        appliedAmount?: number;
        reason?: string;
    }>;
    methodModifiers: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
        appliedAmount?: number;
        reason?: string;
    }>;
    // Legacy field for backwards compatibility
    modifiers: Array<{
        name: string;
        type: string;
        value: number;
        applied: boolean;
        reason?: string;
    }>;
    paymentMethod: {
        id: string;
        name: string;
        type: string;
    };
    breakdown: {
        subtotal: number;
        serviceModifiersTotal: number;
        methodModifiersTotal: number;
        totalModifiers: number;
        finalPrice: number;
    };
}

export interface LevelRangeCalculationRequest {
    serviceId: string;
    startLevel: number;
    endLevel: number;
    groupName?: string; // Optional: filter methods by group name (e.g., "zulrah", "vorkath")
    skipModifiers?: boolean; // Optional: skip applying modifiers (for calculator commands)
}

export interface MethodOption {
    methodId: string;
    methodName: string;
    basePrice: number; // Per XP
    pricingUnit: string;
    levelRanges: Array<{
        startLevel: number;
        endLevel: number;
        xpRequired: number;
        totalPrice: number;
        methodName?: string; // For combined methods
        ratePerXp?: number; // For combined methods
    }>;
    modifiers: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
    }>;
    subtotal: number;
    modifiersTotal: number;
    finalPrice: number;
    isCheapest: boolean;
    segments?: Array<{ // For combined methods
        startLevel: number;
        endLevel: number;
        xpRequired: number;
        method: any;
        basePrice: number;
        totalPrice: number;
    }>;
}

export interface LevelRangeCalculationResult {
    service: {
        id: string;
        name: string;
        emoji: string;
    };
    levels: {
        start: number;
        end: number;
        totalXp: number;
        formattedXp: string;
    };
    methodOptions: MethodOption[];
}

@Service()
export default class PricingCalculatorService {
    private redis = getRedisService();

    // Cache TTL constants (in seconds)
    private readonly CACHE_TTL = {
        SERVICE_DATA: 5 * 60,        // 5 minutes
        PRICING_CALCULATION: 10 * 60, // 10 minutes
        PAYMENT_METHODS: 60 * 60,     // 1 hour
    };

    constructor() {
        logger.info('[PricingCalculator] Service initialized with Redis caching');
    }

    /**
     * Generate cache key for pricing calculations
     */
    private generatePricingCacheKey(
        methodId: string,
        paymentMethodId: string,
        quantity: number,
        serviceModifierIds: string[]
    ): string {
        const modifiersKey = serviceModifierIds.sort().join(',') || 'none';
        return `pricing:calc:${methodId}:${paymentMethodId}:${quantity}:${modifiersKey}`;
    }

    /**
     * Generate cache key for level range calculations
     */
    private generateLevelRangeCacheKey(
        serviceId: string,
        startLevel: number,
        endLevel: number,
        groupName?: string
    ): string {
        const groupKey = groupName || 'all';
        return `pricing:range:${serviceId}:${startLevel}-${endLevel}:${groupKey}`;
    }

    /**
     * Invalidate all pricing cache for a service
     */
    async invalidateServiceCache(serviceId: string): Promise<void> {
        try {
            // Note: Redis doesn't have a built-in way to delete by pattern in this implementation
            // In production, you'd want to use Redis SCAN with pattern matching
            logger.info(`[PricingCalculator] Cache invalidation requested for service: ${serviceId}`);
            // For now, we rely on TTL expiration
        } catch (error) {
            logger.error('[PricingCalculator] Error invalidating cache:', error);
        }
    }

    async calculatePrice(
        request: PriceCalculationRequest
    ): Promise<PriceCalculationResult> {
        const {
            methodId,
            paymentMethodId,
            quantity = 1,
            serviceModifierIds = [],
            customConditions = {},
        } = request;

        // Generate cache key
        const cacheKey = this.generatePricingCacheKey(
            methodId,
            paymentMethodId,
            quantity,
            serviceModifierIds
        );

        // Try to get from cache
        try {
            const cached = await this.redis.get<PriceCalculationResult>(cacheKey);
            if (cached) {
                logger.debug(`[PricingCalculator] 🎯 Cache HIT: ${cacheKey}`);
                return cached;
            }
            logger.debug(`[PricingCalculator] 💨 Cache MISS: ${cacheKey}`);
        } catch (error) {
            logger.warn('[PricingCalculator] Cache read error, continuing without cache:', error);
        }

        // Get pricing method with modifiers and service
        const method = await prisma.pricingMethod.findFirst({
            where: {
                id: methodId,
                active: true,
                deletedAt: null,
            },
            include: {
                service: {
                    include: {
                        serviceModifiers: {
                            where: { active: true },
                            orderBy: { priority: "asc" },
                        },
                    },
                },
                modifiers: {
                    where: { active: true },
                    orderBy: { priority: "asc" },
                },
                methodPrices: {
                    where: { paymentMethodId },
                    include: {
                        paymentMethod: {
                            select: {
                                id: true,
                                name: true,
                                type: true,
                            },
                        },
                    },
                },
            },
        });

        if (!method) {
            throw new NotFoundError("Pricing method not found");
        }

        // Get payment method (either from methodPrices or fetch default)
        let paymentMethod;
        let methodPrice = 0;

        if (method.methodPrices.length > 0) {
            paymentMethod = method.methodPrices[0].paymentMethod;
            methodPrice = Number(method.methodPrices[0].price);
        } else {
            // If no methodPrices, fetch the payment method directly and use price 0
            paymentMethod = await prisma.paymentMethod.findUnique({
                where: { id: paymentMethodId },
                select: {
                    id: true,
                    name: true,
                    type: true,
                },
            });
            if (!paymentMethod) {
                throw new NotFoundError("Payment method not found");
            }
        }

        const basePrice = Number(method.basePrice);

        // Calculate base price based on pricing unit
        let calculatedPrice = this.calculateBasePrice(
            basePrice,
            method.pricingUnit,
            quantity
        );
        calculatedPrice += methodPrice; // Add method-specific price (0 if not set)
        const subtotal = calculatedPrice;

        const serviceModifiersApplied = [];
        let serviceModifiersTotal = 0;

        // Apply SERVICE-LEVEL modifiers FIRST
        for (const modifier of method.service.serviceModifiers) {
            // Check if this modifier was selected by the user
            const isSelected = serviceModifierIds.includes(modifier.id);

            // Evaluate condition if exists
            const shouldApply = isSelected && await this.evaluateModifierCondition(
                modifier,
                customConditions,
                calculatedPrice
            );

            if (shouldApply) {
                const priceBeforeModifier = calculatedPrice;
                const newPrice = this.applyModifier(
                    calculatedPrice,
                    modifier.modifierType,
                    Number(modifier.value)
                );
                const appliedAmount = newPrice - priceBeforeModifier;

                serviceModifiersApplied.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: Number(modifier.value),
                    applied: true,
                    appliedAmount: Math.round(appliedAmount * 100) / 100,
                    reason: modifier.condition || "Applied",
                });

                calculatedPrice = newPrice;
                serviceModifiersTotal += appliedAmount;
            } else {
                serviceModifiersApplied.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: Number(modifier.value),
                    applied: false,
                    reason: isSelected ? "Condition not met" : "Not selected",
                });
            }
        }

        const methodModifiersApplied = [];
        let methodModifiersTotal = 0;

        // Apply METHOD-LEVEL modifiers AFTER service modifiers
        for (const modifier of method.modifiers) {
            const shouldApply = await this.evaluateModifierCondition(
                modifier,
                customConditions,
                calculatedPrice
            );

            if (shouldApply) {
                const priceBeforeModifier = calculatedPrice;
                const newPrice = this.applyModifier(
                    calculatedPrice,
                    modifier.modifierType,
                    Number(modifier.value)
                );
                const appliedAmount = newPrice - priceBeforeModifier;

                methodModifiersApplied.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: Number(modifier.value),
                    applied: true,
                    appliedAmount: Math.round(appliedAmount * 100) / 100,
                    reason: modifier.condition || "Applied",
                });

                calculatedPrice = newPrice;
                methodModifiersTotal += appliedAmount;
            } else {
                methodModifiersApplied.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: Number(modifier.value),
                    applied: false,
                    reason: "Condition not met",
                });
            }
        }

        // Legacy modifiers field (combine both for backwards compatibility)
        const allModifiers = [
            ...serviceModifiersApplied.map(m => ({
                name: m.name,
                type: m.type,
                value: m.value,
                applied: m.applied,
                reason: m.reason,
            })),
            ...methodModifiersApplied.map(m => ({
                name: m.name,
                type: m.type,
                value: m.value,
                applied: m.applied,
                reason: m.reason,
            })),
        ];

        const result: PriceCalculationResult = {
            basePrice: basePrice,
            finalPrice: Math.round(calculatedPrice * 100) / 100,
            serviceModifiers: serviceModifiersApplied,
            methodModifiers: methodModifiersApplied,
            modifiers: allModifiers, // Legacy
            paymentMethod: paymentMethod,
            breakdown: {
                subtotal: Math.round(subtotal * 100) / 100,
                serviceModifiersTotal: Math.round(serviceModifiersTotal * 100) / 100,
                methodModifiersTotal: Math.round(methodModifiersTotal * 100) / 100,
                totalModifiers: Math.round((serviceModifiersTotal + methodModifiersTotal) * 100) / 100,
                finalPrice: Math.round(calculatedPrice * 100) / 100,
            },
        };

        // Cache the result
        try {
            await this.redis.set(cacheKey, result, this.CACHE_TTL.PRICING_CALCULATION);
            logger.debug(`[PricingCalculator] 💾 Cached result: ${cacheKey}`);
        } catch (error) {
            logger.warn('[PricingCalculator] Cache write error:', error);
        }

        return result;
    }

    private calculateBasePrice(
        basePrice: number,
        pricingUnit: string,
        quantity: number
    ): number {
        switch (pricingUnit) {
            case "FIXED":
                return basePrice;
            case "PER_LEVEL":
            case "PER_KILL":
            case "PER_ITEM":
            case "PER_HOUR":
                return basePrice * quantity;
            default:
                return basePrice;
        }
    }

    private async evaluateModifierCondition(
        modifier: any,
        customConditions: Record<string, any>,
        currentPrice: number
    ): Promise<boolean> {
        if (!modifier.condition) {
            return true; // No condition means always apply
        }

        try {
            // Parse condition JSON
            const condition = JSON.parse(modifier.condition);

            // Simple condition evaluation
            // This can be extended to support more complex conditions
            if (condition.type === "price_range") {
                return (
                    currentPrice >= condition.min &&
                    currentPrice <= condition.max
                );
            }

            if (condition.type === "custom_field") {
                return customConditions[condition.field] === condition.value;
            }

            if (condition.type === "quantity_range") {
                const quantity = customConditions.quantity || 1;
                return quantity >= condition.min && quantity <= condition.max;
            }

            return true;
        } catch (error) {
            // If condition parsing fails, don't apply the modifier
            return false;
        }
    }

    private applyModifier(
        price: number,
        modifierType: string,
        value: number
    ): number {
        switch (modifierType) {
            case "PERCENTAGE":
                return price * (1 + value / 100);
            case "FIXED":
                return price + value;
            default:
                return price;
        }
    }

    async getServicePricing(serviceId: string) {
        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                active: true,
                deletedAt: null,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        emoji: true,
                    },
                },
                serviceModifiers: {
                    where: { active: true },
                    orderBy: { priority: "asc" },
                },
                pricingMethods: {
                    where: { active: true, deletedAt: null },
                    include: {
                        modifiers: {
                            where: { active: true },
                            orderBy: { priority: "asc" },
                        },
                        methodPrices: {
                            include: {
                                paymentMethod: {
                                    select: {
                                        id: true,
                                        name: true,
                                        type: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        return service;
    }

    /**
     * Calculate price for a level range (e.g., Agility 70-99)
     * Returns separate pricing options for each method, with cheapest marked
     */
    async calculateLevelRangePrice(
        request: LevelRangeCalculationRequest
    ): Promise<LevelRangeCalculationResult> {
        const { serviceId, startLevel, endLevel, groupName, skipModifiers } = request;

        // Validate input
        if (startLevel < 1 || startLevel > 99) {
            throw new BadRequestError("Start level must be between 1 and 99");
        }
        if (endLevel < 1 || endLevel > 99) {
            throw new BadRequestError("End level must be between 1 and 99");
        }
        if (startLevel >= endLevel) {
            throw new BadRequestError("Start level must be less than end level");
        }

        // Generate cache key
        const cacheKey = this.generateLevelRangeCacheKey(
            serviceId,
            startLevel,
            endLevel,
            groupName
        );

        // Try to get from cache
        try {
            const cached = await this.redis.get<LevelRangeCalculationResult>(cacheKey);
            if (cached) {
                logger.info(`[PricingCalculator] 🎯 Cache HIT: Level range ${startLevel}-${endLevel} for service ${serviceId}`);
                return cached;
            }
            logger.info(`[PricingCalculator] 💨 Cache MISS: Level range ${startLevel}-${endLevel} for service ${serviceId}`);
        } catch (error) {
            logger.warn('[PricingCalculator] Cache read error, continuing without cache:', error);
        }

        // Get service with service modifiers
        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                active: true,
                deletedAt: null,
            },
            include: {
                serviceModifiers: {
                    where: { active: true },
                    orderBy: { priority: 'asc' },
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Get pricing methods using raw SQL to avoid Prisma Decimal precision bug
        // Support filtering by groupName if provided
        let query = `
            SELECT
                id,
                name,
                groupName,
                CAST(basePrice AS CHAR) as basePrice,
                pricingUnit,
                startLevel,
                endLevel,
                displayOrder
            FROM PricingMethod
            WHERE serviceId = ?
                AND active = 1
                AND deletedAt IS NULL
                AND pricingUnit = 'PER_LEVEL'`;

        const queryParams: any[] = [serviceId];

        // Add groupName filter if provided
        if (groupName) {
            query += `
                AND groupName = ?`;
            queryParams.push(groupName);
            logger.info(`[PricingCalculator] 🎯 Filtering methods by groupName: "${groupName}"`);
        }

        query += `
            ORDER BY displayOrder ASC`;

        const pricingMethodsRaw: any[] = await prisma.$queryRawUnsafe(query, ...queryParams);

        logger.info(`[PricingCalculator] 📊 Found ${pricingMethodsRaw.length} PER_LEVEL pricing methods for service`);
        pricingMethodsRaw.forEach(m => {
            logger.info(`[PricingCalculator]   - "${m.name}" | Start: ${m.startLevel || 'NULL'} | End: ${m.endLevel || 'NULL'} | Base: ${m.basePrice}`);
        });

        // Get modifiers for these methods
        const methodIds = pricingMethodsRaw.map(m => m.id);
        const modifiers = await prisma.pricingModifier.findMany({
            where: {
                methodId: { in: methodIds },
                active: true,
            },
            orderBy: { priority: 'asc' },
        });

        // Map modifiers to methods
        const pricingMethods = pricingMethodsRaw.map(method => ({
            ...method,
            basePrice: parseFloat(method.basePrice),
            modifiers: modifiers.filter(m => m.methodId === method.id),
        }));

        // Calculate total XP required
        const totalXp = getXpBetweenLevels(startLevel, endLevel);

        logger.info(`[PricingCalculator] 🎯 Requested level range: ${startLevel}-${endLevel} (${formatXp(totalXp)} XP)`);

        // Pass empty array if skipModifiers is true
        const modifiersToApply = skipModifiers ? [] : (service.serviceModifiers || []);

        // NEW APPROACH: Generate ALL method options (optimal + alternatives)
        const methodOptions = this.generateAllMethodOptions(
            pricingMethods,
            startLevel,
            endLevel,
            modifiersToApply
        );

        if (!methodOptions || methodOptions.length === 0) {
            logger.error(`[PricingCalculator] ❌ No pricing methods found for the specified level range ${startLevel}-${endLevel}`);
            throw new BadRequestError(
                "No pricing methods found for the specified level range"
            );
        }

        // Find cheapest option and mark it
        const cheapestOption = methodOptions.reduce((min, curr) =>
            curr.finalPrice < min.finalPrice ? curr : min
        );
        cheapestOption.isCheapest = true;

        logger.info(`[PricingCalculator] 🎯 Generated ${methodOptions.length} method option(s)`);
        logger.info(`[PricingCalculator] 💰 Cheapest: "${cheapestOption.methodName}" at $${cheapestOption.finalPrice.toFixed(2)}`);

        const result: LevelRangeCalculationResult = {
            service: {
                id: service.id,
                name: service.name,
                emoji: service.emoji || "⭐",
            },
            levels: {
                start: startLevel,
                end: endLevel,
                totalXp: totalXp,
                formattedXp: formatXp(totalXp),
            },
            methodOptions,
        };

        // Cache the result
        try {
            await this.redis.set(cacheKey, result, this.CACHE_TTL.PRICING_CALCULATION);
            logger.debug(`[PricingCalculator] 💾 Cached level range result: ${cacheKey}`);
        } catch (error) {
            logger.warn('[PricingCalculator] Cache write error:', error);
        }

        return result;
    }

    /**
     * Generate ALL method options for comparison:
     * 1. Optimal combination (cheapest mix of methods)
     * 2. Each individual method that can cover the full range
     * 3. Named method combinations (e.g., "GOTR Only", "Lava Runes Only")
     * 4. Individual method segments (e.g., "GOTR 27-77", "Blood Runes 77-99")
     */
    private generateAllMethodOptions(
        pricingMethods: any[],
        startLevel: number,
        endLevel: number,
        serviceModifiers: any[]
    ): MethodOption[] {
        let options: MethodOption[] = [];

        logger.info(`[PricingCalculator] 🔍 Generating method options for ${startLevel}-${endLevel}`);

        // Option 1: Optimal combination (cheapest mix)
        const optimalCombo = this.findOptimalMethodCombination(
            pricingMethods,
            startLevel,
            endLevel,
            serviceModifiers
        );

        if (optimalCombo) {
            options.push(optimalCombo);
            logger.info(`[PricingCalculator]   ✅ Optimal Combination: $${optimalCombo.finalPrice.toFixed(2)}`);
        }

        // Option 2: Each individual method that can cover the FULL range
        for (const method of pricingMethods) {
            const methodStart = method.startLevel || 1;
            const methodEnd = method.endLevel || 99;

            // Check if this method can cover the entire requested range
            if (methodStart <= startLevel && methodEnd >= endLevel) {
                const option = this.calculateSingleMethodOption(
                    method,
                    startLevel,
                    endLevel,
                    serviceModifiers
                );

                if (option) {
                    options.push(option);
                    logger.info(`[PricingCalculator]   ✅ Single Method "${method.name}": $${option.finalPrice.toFixed(2)}`);
                }
            }
        }

        // Option 3: Named method groups (e.g., "GOTR Only", "Lava Runes Only")
        // Group methods by base name (before level range)
        const methodGroups = this.groupMethodsByName(pricingMethods);

        for (const [groupName, methods] of Object.entries(methodGroups)) {
            // Skip if this is a single method already added
            if (methods.length === 1) {
                const method = methods[0];
                const methodStart = method.startLevel || 1;
                const methodEnd = method.endLevel || 99;
                if (methodStart <= startLevel && methodEnd >= endLevel) {
                    continue; // Already added as single method
                }
            }

            // Try to build a combination using only this method group
            const groupCombo = this.findMethodGroupCombination(
                methods,
                startLevel,
                endLevel,
                serviceModifiers,
                groupName
            );

            if (groupCombo) {
                options.push(groupCombo);
                logger.info(`[PricingCalculator]   ✅ "${groupName} Only": $${groupCombo.finalPrice.toFixed(2)}`);
            }
        }

        // Option 4: Individual method segments (show each segment separately)
        // This allows customers to see each method's individual price
        for (const method of pricingMethods) {
            const methodStart = method.startLevel || 1;
            const methodEnd = method.endLevel || 99;

            // Check if this method overlaps with the requested range
            const overlapStart = Math.max(startLevel, methodStart);
            const overlapEnd = Math.min(endLevel, methodEnd);

            if (overlapStart < overlapEnd) {
                // Calculate price for just this segment
                const segmentOption = this.calculateSingleMethodSegment(
                    method,
                    overlapStart,
                    overlapEnd,
                    serviceModifiers
                );

                if (segmentOption) {
                    options.push(segmentOption);
                    logger.info(`[PricingCalculator]   ✅ Segment "${method.name}" (${overlapStart}-${overlapEnd}): $${segmentOption.finalPrice.toFixed(2)}`);
                }
            }
        }

        // Sort by grouping methods with same name, then by level
        // Step 1: Extract base name and group methods
        const groupedOptions: Record<string, typeof options> = {};

        for (const option of options) {
            // Extract base name by removing level range patterns like "(48-58)", "(1-48)", etc.
            let baseName = option.methodName
                .replace(/\s*\(\d+-\d+\)\s*/g, '') // Remove (1-27)
                .replace(/\s*\d+-\d+\s*/g, '') // Remove 1-27
                .trim();

            // If empty after cleaning, use original name
            if (!baseName) {
                baseName = option.methodName;
            }

            if (!groupedOptions[baseName]) {
                groupedOptions[baseName] = [];
            }
            groupedOptions[baseName].push(option);
        }

        // Step 2: Sort methods within each group by starting level
        for (const baseName in groupedOptions) {
            groupedOptions[baseName].sort((a, b) => {
                const aStartLevel = a.levelRanges && a.levelRanges.length > 0 ? a.levelRanges[0].startLevel : 0;
                const bStartLevel = b.levelRanges && b.levelRanges.length > 0 ? b.levelRanges[0].startLevel : 0;
                return aStartLevel - bStartLevel;
            });
        }

        // Step 3: Sort groups by minimum starting level in each group
        const sortedGroups = Object.entries(groupedOptions).sort(([nameA, methodsA], [nameB, methodsB]) => {
            const minLevelA = methodsA[0].levelRanges && methodsA[0].levelRanges.length > 0
                ? methodsA[0].levelRanges[0].startLevel
                : 0;
            const minLevelB = methodsB[0].levelRanges && methodsB[0].levelRanges.length > 0
                ? methodsB[0].levelRanges[0].startLevel
                : 0;
            return minLevelA - minLevelB;
        });

        // Step 4: Flatten back to array while maintaining group order
        options = sortedGroups.flatMap(([name, methods]) => methods);

        logger.info(`[PricingCalculator] 📊 Total options generated: ${options.length}`);

        return options;
    }

    /**
     * Group pricing methods by base name (e.g., "GOTR", "Lava Runes", "Blood Runes")
     * Extracts common name patterns before level ranges
     */
    private groupMethodsByName(pricingMethods: any[]): Record<string, any[]> {
        const groups: Record<string, any[]> = {};

        for (const method of pricingMethods) {
            // Extract base name (remove level range patterns like "1-27", "(1-27)", etc.)
            let baseName = method.name
                .replace(/\s*\(\d+-\d+\)\s*/g, '') // Remove (1-27)
                .replace(/\s*\d+-\d+\s*/g, '') // Remove 1-27
                .replace(/\s+$/g, '') // Trim trailing spaces
                .trim();

            // If empty after cleaning, use original name
            if (!baseName) {
                baseName = method.name;
            }

            if (!groups[baseName]) {
                groups[baseName] = [];
            }
            groups[baseName].push(method);
        }

        return groups;
    }

    /**
     * Build a combination using only methods from a specific group
     */
    private findMethodGroupCombination(
        methods: any[],
        startLevel: number,
        endLevel: number,
        serviceModifiers: any[],
        groupName: string
    ): MethodOption | null {
        // Try to cover the range using only these methods
        const segments: Array<{
            startLevel: number;
            endLevel: number;
            xpRequired: number;
            method: any;
            basePrice: number;
            totalPrice: number;
        }> = [];

        let currentLevel = startLevel;

        while (currentLevel < endLevel) {
            // Find method from this group that can cover currentLevel
            const availableMethods = methods.filter(m => {
                const methodStart = m.startLevel || 1;
                const methodEnd = m.endLevel || 99;
                return currentLevel >= methodStart && currentLevel < methodEnd;
            });

            if (availableMethods.length === 0) {
                // Can't cover this level with this group
                return null;
            }

            // Use the cheapest method for this segment
            let bestMethod = availableMethods[0];
            let bestPrice = bestMethod.basePrice;

            for (const method of availableMethods) {
                if (method.basePrice < bestPrice) {
                    bestMethod = method;
                    bestPrice = method.basePrice;
                }
            }

            // Calculate segment
            const methodStart = bestMethod.startLevel || 1;
            const methodEnd = bestMethod.endLevel || 99;
            const segmentStart = currentLevel;
            const segmentEnd = Math.min(endLevel, methodEnd);

            const xpForSegment = getXpBetweenLevels(segmentStart, segmentEnd);
            const priceForSegment = bestMethod.basePrice * xpForSegment;

            segments.push({
                startLevel: segmentStart,
                endLevel: segmentEnd,
                xpRequired: xpForSegment,
                method: bestMethod,
                basePrice: bestMethod.basePrice,
                totalPrice: priceForSegment,
            });

            currentLevel = segmentEnd;
        }

        // Calculate total
        let totalBasePrice = segments.reduce((sum, seg) => sum + seg.totalPrice, 0);
        let totalModifiers = 0;
        const allModifiers: MethodOption["modifiers"] = [];

        // Apply service-level modifiers
        for (const modifier of serviceModifiers) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = totalBasePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                allModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                allModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        const finalPrice = totalBasePrice + totalModifiers;

        return {
            methodId: `group_${groupName.toLowerCase().replace(/\s+/g, '_')}`,
            methodName: `${groupName} Only`,
            basePrice: 0,
            pricingUnit: "PER_LEVEL",
            levelRanges: segments.map(seg => ({
                startLevel: seg.startLevel,
                endLevel: seg.endLevel,
                xpRequired: seg.xpRequired,
                totalPrice: seg.totalPrice,
                methodName: seg.method.name,
                ratePerXp: seg.basePrice,
            })),
            modifiers: allModifiers,
            subtotal: Math.round(totalBasePrice * 100) / 100,
            modifiersTotal: Math.round(totalModifiers * 100) / 100,
            finalPrice: Math.round(finalPrice * 100) / 100,
            isCheapest: false,
            segments,
        };
    }

    /**
     * Calculate pricing for a single method covering the full range
     */
    private calculateSingleMethodOption(
        method: any,
        startLevel: number,
        endLevel: number,
        serviceModifiers: any[]
    ): MethodOption | null {
        const xpRequired = getXpBetweenLevels(startLevel, endLevel);
        const basePrice = method.basePrice * xpRequired;

        // Apply modifiers
        let totalModifiers = 0;
        const modifiersList: MethodOption["modifiers"] = [];

        // Apply service-level modifiers
        for (const modifier of serviceModifiers) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = basePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        // Apply method-level modifiers
        for (const modifier of method.modifiers || []) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = basePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        const finalPrice = basePrice + totalModifiers;

        return {
            methodId: method.id,
            methodName: method.name,
            basePrice: method.basePrice,
            pricingUnit: "PER_LEVEL",
            levelRanges: [{
                startLevel,
                endLevel,
                xpRequired,
                totalPrice: finalPrice,
                methodName: method.name,
                ratePerXp: method.basePrice,
            }],
            modifiers: modifiersList,
            subtotal: Math.round(basePrice * 100) / 100,
            modifiersTotal: Math.round(totalModifiers * 100) / 100,
            finalPrice: Math.round(finalPrice * 100) / 100,
            isCheapest: false,
        };
    }

    /**
     * Calculate pricing for a single method segment (partial range)
     * Used to show individual segment prices like "GOTR 27-77" or "Blood Runes 77-90"
     */
    private calculateSingleMethodSegment(
        method: any,
        startLevel: number,
        endLevel: number,
        serviceModifiers: any[]
    ): MethodOption | null {
        const xpRequired = getXpBetweenLevels(startLevel, endLevel);
        const basePrice = method.basePrice * xpRequired;

        // Apply modifiers
        let totalModifiers = 0;
        const modifiersList: MethodOption["modifiers"] = [];

        // Apply service-level modifiers
        for (const modifier of serviceModifiers) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = basePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        // Apply method-level modifiers
        for (const modifier of method.modifiers || []) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = basePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                modifiersList.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        const finalPrice = basePrice + totalModifiers;

        // Create a descriptive name with the segment range
        const segmentName = `${method.name} (${startLevel}-${endLevel})`;

        return {
            methodId: `${method.id}_segment_${startLevel}_${endLevel}`,
            methodName: segmentName,
            basePrice: method.basePrice,
            pricingUnit: "PER_LEVEL",
            levelRanges: [{
                startLevel,
                endLevel,
                xpRequired,
                totalPrice: finalPrice,
                methodName: segmentName,
                ratePerXp: method.basePrice,
            }],
            modifiers: modifiersList,
            subtotal: Math.round(basePrice * 100) / 100,
            modifiersTotal: Math.round(totalModifiers * 100) / 100,
            finalPrice: Math.round(finalPrice * 100) / 100,
            isCheapest: false,
        };
    }

    /**
     * Find the optimal combination of pricing methods to cover the full level range
     * Uses a greedy algorithm to select the cheapest method for each level segment
     */
    private findOptimalMethodCombination(
        pricingMethods: any[],
        startLevel: number,
        endLevel: number,
        serviceModifiers: any[]
    ): MethodOption | null {
        // Build segments: divide the range into segments covered by different methods
        const segments: Array<{
            startLevel: number;
            endLevel: number;
            xpRequired: number;
            method: any;
            basePrice: number;
            totalPrice: number;
        }> = [];

        let currentLevel = startLevel;

        logger.info(`[PricingCalculator] 🔧 Finding optimal combination for ${startLevel}-${endLevel}`);

        while (currentLevel < endLevel) {
            // Find all methods that can cover currentLevel
            const availableMethods = pricingMethods.filter(m => {
                const methodStart = m.startLevel || 1;
                const methodEnd = m.endLevel || 99;
                return currentLevel >= methodStart && currentLevel < methodEnd;
            });

            if (availableMethods.length === 0) {
                logger.error(`[PricingCalculator] ❌ No method available for level ${currentLevel}`);
                return null;
            }

            // Find the cheapest method for this segment
            let bestMethod = availableMethods[0];
            let bestPrice = bestMethod.basePrice;

            for (const method of availableMethods) {
                if (method.basePrice < bestPrice) {
                    bestMethod = method;
                    bestPrice = method.basePrice;
                }
            }

            // Calculate the segment this method can cover
            const methodStart = bestMethod.startLevel || 1;
            const methodEnd = bestMethod.endLevel || 99;
            const segmentStart = currentLevel;
            const segmentEnd = Math.min(endLevel, methodEnd);

            const xpForSegment = getXpBetweenLevels(segmentStart, segmentEnd);
            const priceForSegment = bestMethod.basePrice * xpForSegment;

            logger.info(`[PricingCalculator]   📍 Segment ${segmentStart}-${segmentEnd}: "${bestMethod.name}" ($${bestMethod.basePrice.toFixed(8)}/XP) = $${priceForSegment.toFixed(2)}`);

            segments.push({
                startLevel: segmentStart,
                endLevel: segmentEnd,
                xpRequired: xpForSegment,
                method: bestMethod,
                basePrice: bestMethod.basePrice,
                totalPrice: priceForSegment,
            });

            currentLevel = segmentEnd;
        }

        // Calculate total price across all segments
        let totalBasePrice = segments.reduce((sum, seg) => sum + seg.totalPrice, 0);
        let totalModifiers = 0;
        const allModifiers: MethodOption["modifiers"] = [];

        // Apply service-level modifiers to the total
        for (const modifier of serviceModifiers) {
            const modifierValue = Number(modifier.value);

            if (modifier.modifierType === "PERCENTAGE") {
                const addedValue = totalBasePrice * (modifierValue / 100);
                totalModifiers += addedValue;

                allModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (modifier.modifierType === "FIXED") {
                totalModifiers += modifierValue;

                allModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            }
        }

        const finalPrice = totalBasePrice + totalModifiers;

        logger.info(`[PricingCalculator] 💰 Total: Base=$${totalBasePrice.toFixed(2)} + Modifiers=$${totalModifiers.toFixed(2)} = $${finalPrice.toFixed(2)}`);

        // Build the combined method option
        return {
            methodId: "combined",
            methodName: "Optimal Combination",
            basePrice: 0, // Not applicable for combined
            pricingUnit: "PER_LEVEL",
            levelRanges: segments.map(seg => ({
                startLevel: seg.startLevel,
                endLevel: seg.endLevel,
                xpRequired: seg.xpRequired,
                totalPrice: seg.totalPrice,
                methodName: seg.method.name,
                ratePerXp: seg.basePrice,
            })),
            modifiers: allModifiers,
            subtotal: Math.round(totalBasePrice * 100) / 100,
            modifiersTotal: Math.round(totalModifiers * 100) / 100,
            finalPrice: Math.round(finalPrice * 100) / 100,
            isCheapest: false,
            segments, // Include segment details for Discord display
        };
    }

}
