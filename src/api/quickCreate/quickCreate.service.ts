import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { QuickCreateDto } from "./dtos/quickCreate.dto";
import { BadRequestError, NotFoundError } from "routing-controllers";
import slugify from "slugify";

@Service()
export default class QuickCreateService {
    constructor() {}

    async quickCreate(data: QuickCreateDto) {
        const result = await prisma.$transaction(async tx => {
            let categoryId: string;
            let categoryCreated = false;
            let categoryName = "";

            if (data.category.mode === "existing" && data.category.existingId) {
                const existingCategory = await tx.serviceCategory.findFirst({
                    where: { id: data.category.existingId, deletedAt: null },
                });

                if (!existingCategory) {
                    throw new NotFoundError("Selected category not found");
                }

                categoryId = existingCategory.id;
                categoryName = existingCategory.name;
            } else if (data.category.mode === "new" && data.category.name) {
                let slug = slugify(data.category.name, {
                    lower: true,
                    strict: true,
                });

                const existingCategory = await tx.serviceCategory.findUnique({
                    where: { slug },
                });

                if (existingCategory) {
                    let counter = 1;
                    let uniqueSlug = `${slug}-${counter}`;

                    while (
                        await tx.serviceCategory.findUnique({
                            where: { slug: uniqueSlug },
                        })
                    ) {
                        counter++;
                        uniqueSlug = `${slug}-${counter}`;
                    }

                    slug = uniqueSlug;
                }

                const newCategory = await tx.serviceCategory.create({
                    data: {
                        name: data.category.name,
                        slug,
                        emoji: data.category.emoji,
                        description: data.category.description,
                        active: data.category.active ?? true,
                    },
                });

                categoryId = newCategory.id;
                categoryName = newCategory.name;
                categoryCreated = true;
            } else {
                throw new BadRequestError(
                    "Invalid category data: must specify either existing category or new category details"
                );
            }

            let serviceId: string;
            let serviceName: string;
            let serviceSlug: string;
            let serviceCreated = false;

            // Handle service selection or creation
            if (data.service.mode === "existing" && data.service.existingId) {
                const existingService = await tx.service.findFirst({
                    where: {
                        id: data.service.existingId,
                        categoryId, // Ensure service belongs to selected category
                        deletedAt: null
                    },
                });

                if (!existingService) {
                    throw new NotFoundError("Selected service not found or doesn't belong to this category");
                }

                serviceId = existingService.id;
                serviceName = existingService.name;
                serviceSlug = existingService.slug;
            } else if (data.service.name) {
                // Create new service
                let newServiceSlug = slugify(data.service.name, {
                    lower: true,
                    strict: true,
                });

                const existingService = await tx.service.findFirst({
                    where: {
                        categoryId,
                        slug: newServiceSlug,
                    },
                });

                if (existingService) {
                    let counter = 1;
                    let uniqueSlug = `${newServiceSlug}-${counter}`;

                    while (
                        await tx.service.findFirst({
                            where: {
                                categoryId,
                                slug: uniqueSlug,
                            },
                        })
                    ) {
                        counter++;
                        uniqueSlug = `${newServiceSlug}-${counter}`;
                    }

                    newServiceSlug = uniqueSlug;
                }

                const service = await tx.service.create({
                    data: {
                        categoryId,
                        name: data.service.name,
                        slug: newServiceSlug,
                        emoji: data.service.emoji,
                        description: data.service.description,
                        active: data.service.active ?? true,
                        displayOrder: data.service.displayOrder ?? 0,
                    },
                });

                serviceId = service.id;
                serviceName = service.name;
                serviceSlug = service.slug;
                serviceCreated = true;
            } else {
                throw new BadRequestError(
                    "Invalid service data: must specify either existing service or new service details"
                );
            }

            let methodsCreated = 0;
            let modifiersCreated = 0;
            const createdMethods = [];

            if (data.methods && data.methods.length > 0) {
                for (const methodData of data.methods) {
                    const pricingMethod = await tx.pricingMethod.create({
                        data: {
                            serviceId: serviceId,
                            name: methodData.name,
                            description: methodData.description,
                            basePrice: methodData.basePrice,
                            pricingUnit: methodData.pricingUnit,
                            startLevel: methodData.startLevel,
                            endLevel: methodData.endLevel,
                            displayOrder: methodData.displayOrder ?? 0,
                            active: methodData.active ?? true,
                        },
                    });

                    methodsCreated++;
                    createdMethods.push({
                        id: pricingMethod.id,
                        name: pricingMethod.name,
                    });

                    if (
                        methodData.modifiers &&
                        methodData.modifiers.length > 0
                    ) {
                        for (const modifierData of methodData.modifiers) {
                            await tx.pricingModifier.create({
                                data: {
                                    methodId: pricingMethod.id,
                                    name: modifierData.name,
                                    modifierType: modifierData.modifierType,
                                    value: modifierData.value,
                                    condition: modifierData.condition,
                                    displayType:
                                        modifierData.displayType ?? "NORMAL",
                                    priority: modifierData.priority ?? 0,
                                    active: modifierData.active ?? true,
                                },
                            });

                            modifiersCreated++;
                        }
                    }
                }
            }

            return {
                category: {
                    id: categoryId,
                    name: categoryName,
                    created: categoryCreated,
                },
                service: {
                    id: serviceId,
                    name: serviceName,
                    slug: serviceSlug,
                    created: serviceCreated,
                },
                summary: {
                    methodsCreated,
                    modifiersCreated,
                    totalItems:
                        (categoryCreated ? 1 : 0) +
                        (serviceCreated ? 1 : 0) +
                        methodsCreated +
                        modifiersCreated,
                },
                methods: createdMethods,
                redirectUrl: `/services/${serviceId}`,
            };
        });

        return result;
    }
}
