import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateCategoryTicketSettingsDto,
    UpdateCategoryTicketSettingsDto,
} from "./dtos";
import { NotFoundError } from "routing-controllers";
import logger from "../../common/loggers";

const DEFAULT_WELCOME_MESSAGE = `Welcome to our support!

**Order Details:**
- Service: {service}
- Estimated Price: {price} {currency}

Our support team will assist you shortly. Please wait patiently while we review your request.

**Important Notes:**
- Please provide any additional information that might help us process your order faster
- Do not share sensitive information (passwords, 2FA codes) until our support confirms the order`;

const DEFAULT_WELCOME_TITLE = "Welcome to Support!";
const DEFAULT_EMBED_COLOR = "5865F2";

@Service()
export default class CategoryTicketSettingsService {

    async upsert(data: CreateCategoryTicketSettingsDto) {
        const category = await prisma.serviceCategory.findUnique({
            where: { id: data.categoryId },
        });

        if (!category) {
            throw new NotFoundError("Category not found");
        }

        const existingSettings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId: data.categoryId },
        });

        const settingsData = {
            bannerUrl: data.bannerUrl,
            welcomeTitle: data.welcomeTitle || DEFAULT_WELCOME_TITLE,
            welcomeMessage: data.welcomeMessage,
            footerText: data.footerText,
            embedColor: data.embedColor || DEFAULT_EMBED_COLOR,
            isActive: data.isActive ?? true,
        };

        const includeCategory = {
            category: {
                select: {
                    id: true,
                    name: true,
                    emoji: true,
                },
            },
        };

        if (existingSettings) {
            const updated = await prisma.categoryTicketSettings.update({
                where: { categoryId: data.categoryId },
                data: { ...settingsData, updatedAt: new Date() },
                include: includeCategory,
            });
            logger.info(`Updated ticket settings for category: ${category.name}`);
            return updated;
        }

        const created = await prisma.categoryTicketSettings.create({
            data: { categoryId: data.categoryId, ...settingsData },
            include: includeCategory,
        });
        logger.info(`Created ticket settings for category: ${category.name}`);
        return created;
    }

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

    async updateByCategoryId(categoryId: string, data: UpdateCategoryTicketSettingsDto) {
        const settings = await prisma.categoryTicketSettings.findUnique({
            where: { categoryId },
        });

        if (!settings) {
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

        rendered = rendered.replace(/@+{customer}/g, "{customer}");
        rendered = rendered.replace(/@+{support}/g, "{support}");

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

    async renderWelcomeMessageForCategory(
        categoryId: string,
        variables: {
            customer?: string;
            support?: string;
            service?: string;
            price?: string;
            currency?: string;
            ticketId?: string;
        }
    ) {
        const settings = await this.getByCategoryIdOrDefault(categoryId);

        const rendered = this.renderWelcomeMessage(settings.welcomeMessage, {
            ...variables,
            categoryName: settings.category?.name,
        });

        return {
            title: settings.welcomeTitle,
            message: rendered,
            bannerUrl: settings.bannerUrl,
            embedColor: settings.embedColor,
            footerText: settings.footerText,
        };
    }
}
