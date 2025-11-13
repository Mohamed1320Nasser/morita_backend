import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { getXpBetweenLevels, formatXp } from "../../common/utils/xpCalculator";

export interface PriceCalculationRequest {
    methodId: string;
    paymentMethodId: string;
    quantity?: number; // For PER_LEVEL, PER_KILL, PER_ITEM, PER_HOUR
    customConditions?: Record<string, any>; // For modifier conditions
}

export interface PriceCalculationResult {
    basePrice: number;
    finalPrice: number;
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
        totalModifiers: number;
        finalPrice: number;
    };
}

export interface LevelRangeCalculationRequest {
    serviceId: string;
    startLevel: number;
    endLevel: number;
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
    constructor() {}

    async calculatePrice(
        request: PriceCalculationRequest
    ): Promise<PriceCalculationResult> {
        const {
            methodId,
            paymentMethodId,
            quantity = 1,
            customConditions = {},
        } = request;

        // Get pricing method with modifiers
        const method = await prisma.pricingMethod.findFirst({
            where: {
                id: methodId,
                active: true,
                deletedAt: null,
            },
            include: {
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

        if (method.methodPrices.length === 0) {
            throw new BadRequestError(
                "No pricing found for this payment method"
            );
        }

        const paymentMethod = method.methodPrices[0].paymentMethod;
        const basePrice = Number(method.basePrice);
        const methodPrice = Number(method.methodPrices[0].price);

        // Calculate base price based on pricing unit
        let calculatedPrice = this.calculateBasePrice(
            basePrice,
            method.pricingUnit,
            quantity
        );
        calculatedPrice += methodPrice; // Add method-specific price

        const appliedModifiers = [];
        let totalModifierValue = 0;

        // Apply modifiers
        for (const modifier of method.modifiers) {
            const shouldApply = await this.evaluateModifierCondition(
                modifier,
                customConditions,
                calculatedPrice
            );

            if (shouldApply) {
                const modifierValue = this.applyModifier(
                    calculatedPrice,
                    modifier.modifierType,
                    Number(modifier.value)
                );

                appliedModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    value: Number(modifier.value),
                    applied: true,
                    reason: modifier.condition || "Condition met",
                });

                if (modifier.modifierType === "PERCENTAGE") {
                    calculatedPrice = modifierValue;
                    totalModifierValue += modifierValue - calculatedPrice;
                } else {
                    calculatedPrice = modifierValue;
                    totalModifierValue += Number(modifier.value);
                }
            } else {
                appliedModifiers.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    value: Number(modifier.value),
                    applied: false,
                    reason: "Condition not met",
                });
            }
        }

        return {
            basePrice: basePrice,
            finalPrice: Math.round(calculatedPrice * 100) / 100, // Round to 2 decimal places
            modifiers: appliedModifiers,
            paymentMethod: paymentMethod,
            breakdown: {
                subtotal: basePrice + methodPrice,
                totalModifiers: totalModifierValue,
                finalPrice: Math.round(calculatedPrice * 100) / 100,
            },
        };
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
        const { serviceId, startLevel, endLevel } = request;

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

        // Get service
        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                active: true,
                deletedAt: null,
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Get pricing methods using raw SQL to avoid Prisma Decimal precision bug
        const pricingMethodsRaw: any[] = await prisma.$queryRawUnsafe(`
            SELECT
                id,
                name,
                CAST(basePrice AS CHAR) as basePrice,
                pricingUnit,
                startLevel,
                endLevel,
                displayOrder
            FROM PricingMethod
            WHERE serviceId = ?
                AND active = 1
                AND deletedAt IS NULL
                AND pricingUnit = 'PER_LEVEL'
            ORDER BY displayOrder ASC
        `, serviceId);

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

        // Calculate each method separately
        const methodOptions: MethodOption[] = [];

        for (const method of pricingMethods) {
            // Check if this method applies to the requested level range
            const methodStart = method.startLevel || 1;
            const methodEnd = method.endLevel || 99;

            // Check for overlap
            const hasOverlap =
                (startLevel >= methodStart && startLevel < methodEnd) ||
                (endLevel > methodStart && endLevel <= methodEnd) ||
                (startLevel <= methodStart && endLevel >= methodEnd);

            if (!hasOverlap) {
                continue; // Skip methods that don't apply to this range
            }

            // Calculate the overlap
            const overlapStart = Math.max(startLevel, methodStart);
            const overlapEnd = Math.min(endLevel, methodEnd);

            // Skip if no actual overlap
            if (overlapStart >= overlapEnd) {
                continue;
            }

            // Calculate XP and price for this range
            const xpForRange = getXpBetweenLevels(overlapStart, overlapEnd);
            const basePrice = method.basePrice;
            const totalPriceForRange = basePrice * xpForRange;

            // Build level ranges for this method
            const levelRanges = [{
                startLevel: overlapStart,
                endLevel: overlapEnd,
                xpRequired: xpForRange,
                totalPrice: totalPriceForRange,
            }];

            // Apply modifiers for this method
            let methodSubtotal = totalPriceForRange;
            let methodModifiersTotal = 0;
            const methodModifierResults: MethodOption["modifiers"] = [];

            for (const modifier of method.modifiers) {
                const modifierValue = Number(modifier.value);

                // For upcharges, always apply
                const shouldApply = modifier.displayType === "UPCHARGE";

                if (shouldApply && modifier.modifierType === "PERCENTAGE") {
                    const addedValue = methodSubtotal * (modifierValue / 100);
                    methodModifiersTotal += addedValue;

                    methodModifierResults.push({
                        name: modifier.name,
                        type: modifier.modifierType,
                        displayType: modifier.displayType,
                        value: modifierValue,
                        applied: true,
                    });
                } else if (shouldApply && modifier.modifierType === "FIXED") {
                    methodModifiersTotal += modifierValue;

                    methodModifierResults.push({
                        name: modifier.name,
                        type: modifier.modifierType,
                        displayType: modifier.displayType,
                        value: modifierValue,
                        applied: true,
                    });
                } else {
                    // Notes and warnings are not applied, just shown
                    methodModifierResults.push({
                        name: modifier.name,
                        type: modifier.modifierType,
                        displayType: modifier.displayType,
                        value: modifierValue,
                        applied: false,
                    });
                }
            }

            const methodFinalPrice = methodSubtotal + methodModifiersTotal;

            methodOptions.push({
                methodId: method.id,
                methodName: method.name,
                basePrice: basePrice,
                pricingUnit: method.pricingUnit,
                levelRanges,
                modifiers: methodModifierResults,
                subtotal: Math.round(methodSubtotal * 100) / 100,
                modifiersTotal: Math.round(methodModifiersTotal * 100) / 100,
                finalPrice: Math.round(methodFinalPrice * 100) / 100,
                isCheapest: false, // Will be set below
            });
        }

        if (methodOptions.length === 0) {
            throw new BadRequestError(
                "No pricing methods found for the specified level range"
            );
        }

        // Mark the cheapest option
        const cheapestOption = methodOptions.reduce((min, option) =>
            option.finalPrice < min.finalPrice ? option : min
        );
        cheapestOption.isCheapest = true;

        return {
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
    }
}
