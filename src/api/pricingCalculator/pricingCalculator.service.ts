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
    priceBreakdown: Array<{
        methodName: string;
        startLevel: number;
        endLevel: number;
        xpRequired: number;
        basePrice: number;
        pricingUnit: string;
        totalPrice: number;
    }>;
    modifiers: Array<{
        name: string;
        type: string;
        displayType: string;
        value: number;
        applied: boolean;
    }>;
    totals: {
        totalXp: number;
        totalXpFormatted: string;
        subtotal: number;
        modifiersTotal: number;
        finalPrice: number;
        gpCost?: number; // If service has GP conversion rate
    };
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
     * This is used for the pricing calculator feature
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

        // Get service with pricing methods
        const service = await prisma.service.findFirst({
            where: {
                id: serviceId,
                active: true,
                deletedAt: null,
            },
            include: {
                pricingMethods: {
                    where: {
                        active: true,
                        deletedAt: null,
                        pricingUnit: "PER_LEVEL", // Only level-based pricing
                    },
                    include: {
                        modifiers: {
                            where: { active: true },
                            orderBy: { priority: "asc" },
                        },
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Calculate total XP required
        const totalXp = getXpBetweenLevels(startLevel, endLevel);

        // Find all pricing methods that overlap with the requested level range
        const applicableMethods = service.pricingMethods.filter((method) => {
            // If method has no level range, it applies to all levels
            if (!method.startLevel || !method.endLevel) {
                return true;
            }

            // Check if there's any overlap between requested range and method range
            const methodStart = method.startLevel;
            const methodEnd = method.endLevel;

            return (
                (startLevel >= methodStart && startLevel < methodEnd) ||
                (endLevel > methodStart && endLevel <= methodEnd) ||
                (startLevel <= methodStart && endLevel >= methodEnd)
            );
        });

        if (applicableMethods.length === 0) {
            throw new BadRequestError(
                "No pricing methods found for the specified level range"
            );
        }

        // Calculate price breakdown for each applicable method
        const priceBreakdown: LevelRangeCalculationResult["priceBreakdown"] =
            [];
        let subtotal = 0;

        for (const method of applicableMethods) {
            // Determine the overlap between requested range and method range
            const methodStart = method.startLevel || 1;
            const methodEnd = method.endLevel || 99;

            const overlapStart = Math.max(startLevel, methodStart);
            const overlapEnd = Math.min(endLevel, methodEnd);

            // Skip if no actual overlap (shouldn't happen due to filter above)
            if (overlapStart >= overlapEnd) {
                continue;
            }

            // Calculate XP for this range
            const xpForRange = getXpBetweenLevels(overlapStart, overlapEnd);

            // Calculate number of levels
            const numLevels = overlapEnd - overlapStart;

            // Calculate price for this range
            const basePrice = Number(method.basePrice);
            const totalPriceForRange = basePrice * numLevels;

            subtotal += totalPriceForRange;

            priceBreakdown.push({
                methodName: method.name,
                startLevel: overlapStart,
                endLevel: overlapEnd,
                xpRequired: xpForRange,
                basePrice: basePrice,
                pricingUnit: method.pricingUnit,
                totalPrice: totalPriceForRange,
            });
        }

        // Collect all unique modifiers from all applicable methods
        const allModifiers = new Map();
        for (const method of applicableMethods) {
            for (const modifier of method.modifiers) {
                // Use modifier name as key to avoid duplicates
                if (!allModifiers.has(modifier.name)) {
                    allModifiers.set(modifier.name, modifier);
                }
            }
        }

        // Apply modifiers to the subtotal
        let finalPrice = subtotal;
        let modifiersTotal = 0;
        const modifierResults: LevelRangeCalculationResult["modifiers"] = [];

        for (const [_, modifier] of allModifiers) {
            const modifierValue = Number(modifier.value);

            // For upcharges, always apply (they're warnings/requirements)
            const shouldApply = modifier.displayType === "UPCHARGE";

            if (shouldApply && modifier.modifierType === "PERCENTAGE") {
                const addedValue = subtotal * (modifierValue / 100);
                finalPrice += addedValue;
                modifiersTotal += addedValue;

                modifierResults.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else if (shouldApply && modifier.modifierType === "FIXED") {
                finalPrice += modifierValue;
                modifiersTotal += modifierValue;

                modifierResults.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: true,
                });
            } else {
                // Notes and warnings are not applied, just shown
                modifierResults.push({
                    name: modifier.name,
                    type: modifier.modifierType,
                    displayType: modifier.displayType,
                    value: modifierValue,
                    applied: false,
                });
            }
        }

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
            priceBreakdown,
            modifiers: modifierResults,
            totals: {
                totalXp: totalXp,
                totalXpFormatted: formatXp(totalXp),
                subtotal: Math.round(subtotal * 100) / 100,
                modifiersTotal: Math.round(modifiersTotal * 100) / 100,
                finalPrice: Math.round(finalPrice * 100) / 100,
            },
        };
    }
}
