import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreatePricingMethodDto,
    UpdatePricingMethodDto,
    GetPricingMethodListDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { countStart } from "../../common/helpers/pagination.helper";

@Service()
export default class PricingMethodService {
    constructor() {}

    async create(data: CreatePricingMethodDto) {
        const service = await prisma.service.findFirst({
            where: { id: data.serviceId, deletedAt: null },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        const pricingMethod = await prisma.pricingMethod.create({
            data,
        });

        return pricingMethod;
    }

    async update(id: string, data: UpdatePricingMethodDto) {
        const method = await prisma.pricingMethod.findFirst({
            where: { id, deletedAt: null },
        });

        if (!method) {
            throw new NotFoundError("Pricing method not found");
        }

        const updatedMethod = await prisma.pricingMethod.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        return updatedMethod;
    }

    async getList(query: GetPricingMethodListDto) {
        const where: any = {
            deletedAt: null,
        };

        // Add optional filters
        if (query.serviceId) {
            where.serviceId = query.serviceId;
        }

        if (query.active !== undefined) {
            where.active = query.active;
        }

        if (query.pricingUnit) {
            where.pricingUnit = query.pricingUnit;
        }

        // Add search functionality
        if (query.search) {
            where.OR = [
                {
                    name: {
                        contains: query.search,
                        mode: "insensitive",
                    },
                },
                {
                    description: {
                        contains: query.search,
                        mode: "insensitive",
                    },
                },
            ];
        }

        const [methods, filterCount, totalCount] = await Promise.all([
            prisma.pricingMethod.findMany({
                select: {
                    id: true,
                    name: true,
                    description: true,
                    basePrice: true,
                    pricingUnit: true,
                    startLevel: true,
                    endLevel: true,
                    active: true,
                    displayOrder: true,
                    createdAt: true,
                    service: {
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            emoji: true,
                            category: {
                                select: {
                                    id: true,
                                    name: true,
                                    slug: true,
                                },
                            },
                        },
                    },
                    modifiers: {
                        select: {
                            id: true,
                        },
                    },
                },
                where,
                skip: countStart(query.page, query.limit),
                take: query.limit,
                orderBy: {
                    [query.sortBy as string]: query.sortOrder,
                },
            }),
            prisma.pricingMethod.count({ where }),
            prisma.pricingMethod.count({
                where: { deletedAt: null },
            }),
        ]);

        // Map methods to include _count with modifiers count
        const methodsWithCount = methods.map(method => ({
            ...method,
            _count: {
                modifiers: method.modifiers.length,
            },
            // Remove modifiers array from response
            modifiers: undefined,
        }));

        return {
            list: methodsWithCount,
            total: totalCount,
            filterCount,
        };
    }

    async getSingle(id: string) {
        const method = await prisma.pricingMethod.findFirst({
            where: {
                id,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                description: true,
                basePrice: true,
                pricingUnit: true,
                startLevel: true,
                endLevel: true,
                active: true,
                displayOrder: true,
                serviceId: true,
                createdAt: true,
                service: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        category: {
                            select: {
                                id: true,
                                name: true,
                                slug: true,
                            },
                        },
                    },
                },
                modifiers: {
                    where: { active: true },
                    orderBy: { priority: "asc" },
                },
                methodPrices: {
                    select: {
                        id: true,
                        price: true,
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
            return null;
        }

        return method;
    }

    async delete(id: string) {
        const method = await prisma.pricingMethod.findFirst({
            where: { id, deletedAt: null },
        });

        if (!method) {
            throw new NotFoundError("Pricing method not found");
        }
        const activeModifiers = await prisma.pricingModifier.count({
            where: {
                methodId: id,
                active: true,
            },
        });

        if (activeModifiers > 0) {
            throw new BadRequestError(
                "Cannot delete pricing method with active modifiers"
            );
        }

        const activeOrders = await prisma.order.count({
            where: {
                methodId: id,
                status: { in: ["PENDING", "IN_PROGRESS"] },
            },
        });

        if (activeOrders > 0) {
            throw new BadRequestError(
                "Cannot delete pricing method with active orders"
            );
        }
        await prisma.pricingMethod.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        return { message: "Pricing method deleted successfully" };
    }

    async getByService(serviceId: string) {
        const methods = await prisma.pricingMethod.findMany({
            where: {
                serviceId,
                active: true,
                deletedAt: null,
            },
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
            orderBy: [
                { startLevel: "asc" }, // Sort by level range first
                { displayOrder: "asc" }, // Then by display order
            ],
        });

        return methods;
    }
}
