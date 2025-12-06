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
import logger from "../../common/loggers";

// Ticket settings interface
interface TicketSettingsInput {
    welcomeTitle?: string;
    welcomeMessage?: string;
    embedColor?: string;
    bannerUrl?: string | null;
    footerText?: string | null;
}

@Service()
export default class ServiceCategoryService {
    constructor() {}

    async create(data: CreateServiceCategoryDto & { ticketSettings?: TicketSettingsInput }, icon?: API.File) {
        // Auto-generate slug from name if not provided
        let slug = data.slug || slugify(data.name, { lower: true, strict: true });

        // Check if slug already exists and make it unique
        const existingCategory = await prisma.serviceCategory.findUnique({
            where: { slug },
        });

        if (existingCategory) {
            // Add numeric suffix to make slug unique
            let counter = 1;
            let uniqueSlug = `${slug}-${counter}`;

            while (await prisma.serviceCategory.findUnique({ where: { slug: uniqueSlug } })) {
                counter++;
                uniqueSlug = `${slug}-${counter}`;
            }

            slug = uniqueSlug;
        }

        // Extract ticketSettings from data
        const { ticketSettings, ...categoryData } = data;

        const category = await prisma.serviceCategory.create({
            data: {
                ...categoryData,
                slug,
                icon: icon ? { connect: { id: icon.id } } : undefined,
            },
        });

        // Create ticket settings if provided
        if (ticketSettings) {
            await this.upsertTicketSettings(category.id, ticketSettings);
        }

        return category;
    }

    /**
     * Upsert ticket settings for a category
     */
    async upsertTicketSettings(categoryId: string, settings: TicketSettingsInput) {
        try {
            const existing = await prisma.categoryTicketSettings.findUnique({
                where: { categoryId },
            });

            if (existing) {
                await prisma.categoryTicketSettings.update({
                    where: { categoryId },
                    data: {
                        welcomeTitle: settings.welcomeTitle,
                        welcomeMessage: settings.welcomeMessage,
                        embedColor: settings.embedColor,
                        bannerUrl: settings.bannerUrl,
                        footerText: settings.footerText,
                        updatedAt: new Date(),
                    },
                });
            } else {
                await prisma.categoryTicketSettings.create({
                    data: {
                        categoryId,
                        welcomeTitle: settings.welcomeTitle || "Welcome to Your Ticket!",
                        welcomeMessage: settings.welcomeMessage || "Our support team will assist you shortly.",
                        embedColor: settings.embedColor || "5865F2",
                        bannerUrl: settings.bannerUrl,
                        footerText: settings.footerText,
                    },
                });
            }

            logger.info(`Ticket settings saved for category ${categoryId}`);
        } catch (error) {
            logger.error(`Error saving ticket settings for category ${categoryId}:`, error);
        }
    }

    /**
     * Get ticket settings for a category
     */
    async getTicketSettings(categoryId: string) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId },
        });

        return settings || {
            welcomeTitle: "Welcome to Your Ticket!",
            welcomeMessage: "Our support team will assist you shortly.",
            embedColor: "5865F2",
            bannerUrl: null,
            footerText: null,
        };
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
                ticketSettings: true, // Include ticket settings
            },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        return category;
    }

    async update(id: string, data: UpdateServiceCategoryDto & { ticketSettings?: TicketSettingsInput }, icon?: API.File) {
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

        // Extract ticketSettings from data
        const { ticketSettings, ...categoryData } = data;

        const updatedCategory = await prisma.serviceCategory.update({
            where: { id },
            data: {
                ...categoryData,
                icon: icon ? { connect: { id: icon.id } } : undefined,
                updatedAt: new Date(),
            },
            include: {
                ticketSettings: true,
            },
        });

        // Update ticket settings if provided
        if (ticketSettings) {
            await this.upsertTicketSettings(id, ticketSettings);
        }

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
