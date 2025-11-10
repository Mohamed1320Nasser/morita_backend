import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateServiceCategoryDto,
    UpdateServiceCategoryDto,
    GetServiceCategoryListDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import slugify from "slugify";
import API from "../../common/config/api.types";

@Service()
export default class ServiceCategoryService {
    constructor() {}

    async create(data: CreateServiceCategoryDto, icon?: API.File) {
        // Check if slug already exists
        const existingCategory = await prisma.serviceCategory.findUnique({
            where: { slug: data.slug },
        });

        if (existingCategory) {
            throw new BadRequestError("Category with this slug already exists");
        }

        const category = await prisma.serviceCategory.create({
            data: {
                ...data,
                icon: icon ? { connect: { id: icon.id } } : undefined,
                slug:
                    data.slug ||
                    slugify(data.name, { lower: true, strict: true }),
            },
        });

        return category;
    }

    async getList(query: GetServiceCategoryListDto) {
        const { search, active, page, limit, sortBy, sortOrder } = query;
        const skip = ((page || 1) - 1) * (limit || 10);

        const where = {
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

        const [categories, total] = await Promise.all([
            prisma.serviceCategory.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    [sortBy as string]: sortOrder,
                },
                include: {
                    services: {
                        where: { active: true, deletedAt: null },
                        select: {
                            id: true,
                            name: true,
                            slug: true,
                            emoji: true,
                        },
                    },
                },
            }),
            prisma.serviceCategory.count({ where }),
        ]);

        return {
            list: categories,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / (limit || 10)),
        };
    }

    async getSingle(id: string) {
        const category = await prisma.serviceCategory.findFirst({
            where: {
                id,
                deletedAt: null,
            },
            include: {
                services: {
                    where: { active: true, deletedAt: null },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        emoji: true,
                        description: true,
                        displayOrder: true,
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        return category;
    }

    async update(id: string, data: UpdateServiceCategoryDto, icon?: API.File) {
        const category = await prisma.serviceCategory.findFirst({
            where: { id, deletedAt: null },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        // Check if slug already exists (if being updated)
        if (data.slug && data.slug !== category.slug) {
            const existingCategory = await prisma.serviceCategory.findUnique({
                where: { slug: data.slug },
            });

            if (existingCategory) {
                throw new BadRequestError(
                    "Category with this slug already exists"
                );
            }
        }

        const updatedCategory = await prisma.serviceCategory.update({
            where: { id },
            data: {
                ...data,
                icon: icon ? { connect: { id: icon.id } } : undefined,
                updatedAt: new Date(),
            },
        });

        return updatedCategory;
    }

    async delete(id: string) {
        const category = await prisma.serviceCategory.findFirst({
            where: { id, deletedAt: null },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        // Check if category has active services
        const activeServices = await prisma.service.count({
            where: {
                categoryId: id,
                active: true,
                deletedAt: null,
            },
        });

        if (activeServices > 0) {
            throw new BadRequestError(
                "Cannot delete category with active services"
            );
        }

        // Soft delete
        await prisma.serviceCategory.update({
            where: { id },
            data: {
                deletedAt: new Date(),
                updatedAt: new Date(),
            },
        });

        return { message: "Category deleted successfully" };
    }

    async getPublicList() {
        const categories = await prisma.serviceCategory.findMany({
            where: {
                active: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                emoji: true,
                description: true,
                icon: true,
                displayOrder: true,
                services: {
                    where: { active: true, deletedAt: null },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        emoji: true,
                        description: true,
                        displayOrder: true,
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
            orderBy: { displayOrder: "asc" },
        });

        return categories;
    }

    async getPublicListWithServices() {
        const categories = await prisma.serviceCategory.findMany({
            where: {
                active: true,
                deletedAt: null,
            },
            select: {
                id: true,
                name: true,
                slug: true,
                emoji: true,
                description: true,
                icon: true,
                displayOrder: true,
                services: {
                    where: { active: true, deletedAt: null },
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        emoji: true,
                        description: true,
                        displayOrder: true,
                    },
                    orderBy: { displayOrder: "asc" },
                },
            },
            orderBy: { displayOrder: "asc" },
        });

        return categories;
    }
}
