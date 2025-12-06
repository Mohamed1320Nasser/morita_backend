import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateCategoryTicketSettingsDto,
    UpdateCategoryTicketSettingsDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import logger from "../../common/loggers";

// Default welcome message template
const DEFAULT_WELCOME_MESSAGE = `Welcome to our support!

**Order Details:**
- Service: {service}
- Estimated Price: {price} {currency}

Our support team will assist you shortly. Please wait patiently while we review your request.

**Important Notes:**
- Please provide any additional information that might help us process your order faster
- Do not share sensitive information (passwords, 2FA codes) until our support confirms the order`;

const DEFAULT_WELCOME_TITLE = "Welcome to Support!";
const DEFAULT_EMBED_COLOR = "5865F2"; // Discord blurple

@Service()
export default class CategoryTicketSettingsService {
    constructor() {}

    /**
     * Create or update category ticket settings
     */
    async upsert(data: CreateCategoryTicketSettingsDto) {
        // Verify the category exists
        const category = await prisma.serviceCategory.findUnique({
            where: { id: data.categoryId },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        // Check if settings already exist
        const existingSettings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId: data.categoryId },
        });

        if (existingSettings) {
            // Update existing
            const updated = await prisma.categoryTicketSettings.update({
                where: { categoryId: data.categoryId },
                data: {
                    bannerUrl: data.bannerUrl,
                    welcomeTitle: data.welcomeTitle,
                    welcomeMessage: data.welcomeMessage,
                    footerText: data.footerText,
                    embedColor: data.embedColor || DEFAULT_EMBED_COLOR,
                    isActive: data.isActive ?? true,
                    updatedAt: new Date(),
                },
                include: {
                    category: {
                        select: {
                            id: true,
                            name: true,
                            emoji: true,
                        },
                    },
                },
            });

            logger.info(`Updated ticket settings for category: ${category.name}`);
            return updated;
        }

        // Create new
        const created = await prisma.categoryTicketSettings.create({
            data: {
                categoryId: data.categoryId,
                bannerUrl: data.bannerUrl,
                welcomeTitle: data.welcomeTitle || DEFAULT_WELCOME_TITLE,
                welcomeMessage: data.welcomeMessage,
                footerText: data.footerText,
                embedColor: data.embedColor || DEFAULT_EMBED_COLOR,
                isActive: data.isActive ?? true,
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
        });

        logger.info(`Created ticket settings for category: ${category.name}`);
        return created;
    }

    /**
     * Get settings by category ID
     */
    async getByCategoryId(categoryId: string) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                        slug: true,
                    },
                },
            },
        });

        return settings;
    }

    /**
     * Get settings by category ID or return defaults
     */
    async getByCategoryIdOrDefault(categoryId: string) {
        const category = await prisma.serviceCategory.findUnique({
            where: { id: categoryId },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId },
        });

        if (settings) {
            return {
                ...settings,
                category,
            };
        }

        // Return default settings
        return {
            id: null,
            categoryId,
            bannerUrl: null,
            welcomeTitle: `${category.emoji || ""} Welcome to ${category.name}!`.trim(),
            welcomeMessage: DEFAULT_WELCOME_MESSAGE,
            footerText: null,
            embedColor: DEFAULT_EMBED_COLOR,
            isActive: true,
            category,
        };
    }

    /**
     * Get settings by ID
     */
    async getSingle(id: string) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { id },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
        });

        if (!settings) {
            throw new NotFoundError("Settings not found");
        }

        return settings;
    }

    /**
     * Get all category ticket settings
     */
    async getAll() {
        const settings = await prisma.categoryTicketSettings.findMany({
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                        slug: true,
                        active: true,
                    },
                },
            },
            orderBy: {
                category: {
                    displayOrder: "asc",
                },
            },
        });

        return settings;
    }

    /**
     * Get all categories with their ticket settings (including those without settings)
     */
    async getAllCategoriesWithSettings() {
        const categories = await prisma.serviceCategory.findMany({
            where: {
                active: true,
                deletedAt: null,
            },
            include: {
                ticketSettings: true,
            },
            orderBy: {
                displayOrder: "asc",
            },
        });

        return categories.map((category) => ({
            id: category.id,
            name: category.name,
            emoji: category.emoji,
            slug: category.slug,
            hasSettings: !!category.ticketSettings,
            settings: category.ticketSettings || {
                welcomeTitle: `${category.emoji || ""} Welcome to ${category.name}!`.trim(),
                welcomeMessage: DEFAULT_WELCOME_MESSAGE,
                embedColor: DEFAULT_EMBED_COLOR,
                isActive: true,
            },
        }));
    }

    /**
     * Update settings
     */
    async update(id: string, data: UpdateCategoryTicketSettingsDto) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { id },
        });

        if (!settings) {
            throw new NotFoundError("Settings not found");
        }

        const updated = await prisma.categoryTicketSettings.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
        });

        logger.info(`Updated ticket settings: ${id}`);
        return updated;
    }

    /**
     * Update settings by category ID
     */
    async updateByCategoryId(categoryId: string, data: UpdateCategoryTicketSettingsDto) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId },
        });

        if (!settings) {
            // Create if not exists
            return this.upsert({
                categoryId,
                welcomeMessage: data.welcomeMessage || DEFAULT_WELCOME_MESSAGE,
                ...data,
            });
        }

        const updated = await prisma.categoryTicketSettings.update({
            where: { categoryId },
            data: {
                ...data,
                updatedAt: new Date(),
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
        });

        logger.info(`Updated ticket settings for category: ${categoryId}`);
        return updated;
    }

    /**
     * Delete settings
     */
    async delete(id: string) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { id },
        });

        if (!settings) {
            throw new NotFoundError("Settings not found");
        }

        await prisma.categoryTicketSettings.delete({
            where: { id },
        });

        logger.info(`Deleted ticket settings: ${id}`);
        return { message: "Settings deleted successfully" };
    }

    /**
     * Render welcome message with variables
     */
    renderWelcomeMessage(
        template: string,
        variables: {
            customer?: string;
            support?: string;
            service?: string;
            price?: string;
            currency?: string;
            ticketId?: string;
            categoryName?: string;
        }
    ): string {
        let rendered = template;

        // First, handle cases where users added @ before mention variables
        // (e.g., @{customer}, @@{support}, etc.) - the variables already contain the mention format
        // Use @+ to match one or more @ symbols before the variable
        rendered = rendered.replace(/@+{customer}/g, "{customer}");
        rendered = rendered.replace(/@+{support}/g, "{support}");

        // Replace all variables
        const replacements: Record<string, string> = {
            "{customer}": variables.customer || "Customer",
            "{support}": variables.support || "Support",
            "{service}": variables.service || "Service",
            "{price}": variables.price || "N/A",
            "{currency}": variables.currency || "USD",
            "{ticket_id}": variables.ticketId || "0000",
            "{category}": variables.categoryName || "Category",
        };

        for (const [key, value] of Object.entries(replacements)) {
            rendered = rendered.replace(new RegExp(key, "g"), value);
        }

        return rendered;
    }
}
