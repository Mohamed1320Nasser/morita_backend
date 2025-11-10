import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { CreateServiceDto, UpdateServiceDto, GetServiceListDto } from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import slugify from "slugify";

@Service()
export default class ServiceService {
    constructor() {}

    async create(data: CreateServiceDto) {
        // Check if category exists
        const category = await prisma.serviceCategory.findFirst({
            where: { id: data.categoryId, deletedAt: null },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        // Check if slug already exists in this category
        const existingService = await prisma.service.findFirst({
            where: {
                categoryId: data.categoryId,
                slug: data.slug,
            },
        });

        if (existingService) {
            throw new BadRequestError(
                "Service with this slug already exists in this category"
            );
        }

        const service = await prisma.service.create({
            data: {
                ...data,
                slug:
                    data.slug ||
                    slugify(data.name, { lower: true, strict: true }),
            },
        });

        return service;
    }

    async getList(query: GetServiceListDto) {
        const { categoryId, search, active, page, limit, sortBy, sortOrder } =
            query;
        const skip = ((page || 1) - 1) * (limit || 10);

        const where = {
            ...(categoryId ? { categoryId } : {}),
            ...(active !== undefined ? { active } : {}),
            ...(search
                ? {
                      OR: [
                          { name: { contains: search } },
                          { description: { contains: search } },
                      ],
                  }
                : {}),
            deletedAt: null,
        };

        const [services, total] = await Promise.all([
            prisma.service.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    [sortBy as string]: sortOrder,
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
                        where: { deletedAt: null }, // Include ALL pricing methods (active + inactive) for accurate count
                        select: {
                            id: true,
                            name: true,
                            basePrice: true,
                            pricingUnit: true,
                            active: true,
                        },
                    },
                },
            }),
            prisma.service.count({ where }),
        ]);

        return {
            list: services,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / (limit || 10)),
        };
    }

    async getSingle(id: string) {
        const service = await prisma.service.findFirst({
            where: {
                id,
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
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        basePrice: true,
                        pricingUnit: true,
                        startLevel: true,
                        endLevel: true,
                        displayOrder: true,
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
                        { startLevel: "asc" },
                        { displayOrder: "asc" },
                    ],
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        return service;
    }

    async update(id: string, data: UpdateServiceDto) {
        const service = await prisma.service.findFirst({
            where: { id, deletedAt: null },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Check if category exists (if being updated)
        if (data.categoryId && data.categoryId !== service.categoryId) {
            const category = await prisma.serviceCategory.findFirst({
                where: { id: data.categoryId, deletedAt: null },
            });

            if (!category) {
                throw new NotFoundError("Category not found");
            }
        }

        // Check if slug already exists in this category (if being updated)
        if (data.slug && data.slug !== service.slug) {
            const existingService = await prisma.service.findFirst({
                where: {
                    categoryId: data.categoryId || service.categoryId,
                    slug: data.slug,
                },
            });

            if (existingService) {
                throw new BadRequestError(
                    "Service with this slug already exists in this category"
                );
            }
        }

        const updatedService = await prisma.service.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
        });

        return updatedService;
    }

    async delete(id: string) {
        const service = await prisma.service.findFirst({
            where: { id, deletedAt: null },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Check if service has active pricing methods
        const activeMethods = await prisma.pricingMethod.count({
            where: {
                serviceId: id,
                active: true,
                deletedAt: null,
            },
        });

        if (activeMethods > 0) {
            throw new BadRequestError(
                "Cannot delete service with active pricing methods"
            );
        }

        // Soft delete
        await prisma.service.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        return { message: "Service deleted successfully" };
    }

    async getPublicList(categoryId?: string) {
        const where = {
            active: true,
            deletedAt: null,
            ...(categoryId ? { categoryId } : {}),
        };

        const services = await prisma.service.findMany({
            where,
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                emoji: true,
                displayOrder: true,
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
                    select: {
                        id: true,
                        name: true,
                        basePrice: true,
                        pricingUnit: true,
                        startLevel: true,
                        endLevel: true,
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
                        { startLevel: "asc" },
                        { displayOrder: "asc" },
                    ],
                },
            },
            orderBy: { displayOrder: "asc" },
        });

        return services;
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
                    orderBy: [
                        { startLevel: "asc" },
                        { displayOrder: "asc" },
                    ],
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        return service;
    }

    async getServiceWithPricing(id: string) {
        const service = await prisma.service.findFirst({
            where: {
                id,
                active: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                emoji: true,
                active: true,
                displayOrder: true,
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
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        basePrice: true,
                        pricingUnit: true,
                        startLevel: true,
                        endLevel: true,
                        displayOrder: true,
                        active: true,
                        modifiers: {
                            where: { active: true },
                            select: {
                                id: true,
                                name: true,
                                modifierType: true,
                                value: true,
                                condition: true,
                                displayType: true,
                                priority: true,
                                active: true,
                            },
                            orderBy: { priority: "asc" },
                        },
                        methodPrices: {
                            include: {
                                paymentMethod: {
                                    select: {
                                        id: true,
                                        name: true,
                                        type: true,
                                        active: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [
                        { startLevel: "asc" },
                        { displayOrder: "asc" },
                    ],
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

        // Get all payment methods for this service
        const paymentMethods = await prisma.paymentMethod.findMany({
            where: { active: true },
            select: {
                id: true,
                name: true,
                type: true,
            },
            orderBy: { name: "asc" },
        });

        return {
            ...service,
            paymentMethods,
        };
    }
}
