import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import { CreateServiceDto, UpdateServiceDto, GetServiceListDto } from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import slugify from "slugify";

@Service()
export default class ServiceService {
    constructor() {}

    async create(data: CreateServiceDto) {
        const category = await prisma.serviceCategory.findFirst({
            where: { id: data.categoryId, deletedAt: null },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        let slug =
            data.slug || slugify(data.name, { lower: true, strict: true });

        const existingService = await prisma.service.findFirst({
            where: {
                categoryId: data.categoryId,
                slug,
            },
        });

        if (existingService) {
            let counter = 1;
            let uniqueSlug = `${slug}-${counter}`;

            while (
                await prisma.service.findFirst({
                    where: {
                        categoryId: data.categoryId,
                        slug: uniqueSlug,
                    },
                })
            ) {
                counter++;
                uniqueSlug = `${slug}-${counter}`;
            }

            slug = uniqueSlug;
        }

        const service = await prisma.service.create({
            data: {
                ...data,
                slug,
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
                        where: { deletedAt: null },
                        select: {
                            id: true,
                            name: true,
                            basePrice: true,
                            pricingUnit: true,
                            active: true,
                            shortcuts: true,
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
                        shortcuts: true,
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
                    orderBy: [{ startLevel: "asc" }, { displayOrder: "asc" }],
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

        if (data.categoryId && data.categoryId !== service.categoryId) {
            const category = await prisma.serviceCategory.findFirst({
                where: { id: data.categoryId, deletedAt: null },
            });

            if (!category) {
                throw new NotFoundError("Category not found");
            }
        }

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
                shortcuts: true,
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
                    orderBy: [{ startLevel: "asc" }, { displayOrder: "asc" }],
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
                    orderBy: [{ startLevel: "asc" }, { displayOrder: "asc" }],
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
                imageUrl: true,
                active: true,
                displayOrder: true,
                shortcuts: true,
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
                pricingMethods: {
                    where: { active: true, deletedAt: null },
                    select: {
                        id: true,
                        name: true,
                        groupName: true,
                        description: true,
                        basePrice: true,
                        pricingUnit: true,
                        startLevel: true,
                        endLevel: true,
                        displayOrder: true,
                        shortcuts: true,
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
                    orderBy: [{ startLevel: "asc" }, { displayOrder: "asc" }],
                },
            },
        });

        if (!service) {
            throw new NotFoundError("Service not found");
        }

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
