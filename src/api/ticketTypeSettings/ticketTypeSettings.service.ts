import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateTicketTypeSettingsDto,
    UpdateTicketTypeSettingsDto,
    GetTicketTypeSettingsListDto,
} from "./dtos";
import { NotFoundError } from "routing-controllers";
import { TicketType } from "@prisma/client";
import logger from "../../common/loggers";

const DEFAULT_WELCOME_MESSAGES: Record<TicketType, { title: string; message: string }> = {
    [TicketType.PURCHASE_SERVICES_OSRS]: {
        title: "🎮 OSRS Service Request",
        message: `Hello {customer}!

Thank you for choosing our OSRS services. Our support team ({support}) will assist you shortly.

**Service:** {service}
**Estimated Price:** {price} {currency}
**Ticket ID:** #{ticket_id}

Please provide any additional details about your service request in this channel.

**What happens next:**
1. A support agent will review your request
2. We'll confirm the details and pricing
3. Once payment is received, a verified worker will be assigned
4. You'll receive regular progress updates

We look forward to serving you!`,
    },
    [TicketType.PURCHASE_SERVICES_RS3]: {
        title: "🎮 RS3 Service Request",
        message: `Hello {customer}!

Thank you for choosing our RS3 services. Our support team ({support}) will assist you shortly.

**Service:** {service}
**Estimated Price:** {price} {currency}
**Ticket ID:** #{ticket_id}

Please provide any additional details about your service request in this channel.`,
    },
    [TicketType.BUY_GOLD_OSRS]: {
        title: "💰 Buy OSRS Gold",
        message: `Hello {customer}!

Welcome to your OSRS gold purchase ticket. Our team ({support}) will process your order shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to purchase (in millions)
• Your OSRS username
• Preferred delivery method (Trade, Drop Party, etc.)
• World and location for delivery

Once we confirm the details and receive payment, we'll deliver your gold quickly and safely!`,
    },
    [TicketType.BUY_GOLD_RS3]: {
        title: "💰 Buy RS3 Gold",
        message: `Hello {customer}!

Welcome to your RS3 gold purchase ticket. Our team ({support}) will process your order shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to purchase (in millions)
• Your RS3 username
• Preferred delivery method
• World and location for delivery`,
    },
    [TicketType.SELL_GOLD_OSRS]: {
        title: "💵 Sell OSRS Gold",
        message: `Hello {customer}!

Thank you for selling your OSRS gold to us. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to sell (in millions)
• Your OSRS username
• Preferred payment method
• Payment details (PayPal email, crypto wallet, etc.)

We'll review your request and provide a quote!`,
    },
    [TicketType.SELL_GOLD_RS3]: {
        title: "💵 Sell RS3 Gold",
        message: `Hello {customer}!

Thank you for selling your RS3 gold to us. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Amount of gold you want to sell (in millions)
• Your RS3 username
• Preferred payment method
• Payment details`,
    },
    [TicketType.SWAP_CRYPTO]: {
        title: "🔄 Cryptocurrency Swap",
        message: `Hello {customer}!

Welcome to your crypto swap ticket. Our team ({support}) will process your request shortly.

**Ticket ID:** #{ticket_id}

Please provide the following information:
• Cryptocurrency you want to swap FROM (BTC, ETH, USDT, etc.)
• Cryptocurrency you want to swap TO (or OSRS/RS3 gold)
• Amount you want to swap
• Your wallet address (for receiving the swapped crypto)

We'll provide you with the current exchange rate and process your swap securely!`,
    },
    [TicketType.GENERAL]: {
        title: "💬 General Support",
        message: `Hello {customer}!

Welcome to your support ticket. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}

Please describe your question or issue, and we'll help you as soon as possible.`,
    },
};

const DEFAULT_EMBED_COLOR = "5865F2"; // Discord blurple

@Service()
export default class TicketTypeSettingsService {
    async upsert(data: CreateTicketTypeSettingsDto) {
        const existingSettings = await prisma.ticketTypeSettings.findUnique({
            where: { ticketType: data.ticketType },
        });

        const defaults = DEFAULT_WELCOME_MESSAGES[data.ticketType];
        const settingsData = {
            bannerUrl: data.bannerUrl,
            thumbnailUrl: data.thumbnailUrl,
            welcomeTitle: data.welcomeTitle || defaults.title,
            welcomeMessage: data.welcomeMessage,
            footerText: data.footerText,
            embedColor: data.embedColor || DEFAULT_EMBED_COLOR,
            customFields: data.customFields as any,
            autoAssign: data.autoAssign ?? false,
            notifyOnCreate: data.notifyOnCreate ?? true,
            notifyOnClose: data.notifyOnClose ?? true,
            mentionSupport: data.mentionSupport ?? true,
            mentionCustomer: data.mentionCustomer ?? true,
            isActive: data.isActive ?? true,
        };

        if (existingSettings) {
            const updated = await prisma.ticketTypeSettings.update({
                where: { ticketType: data.ticketType },
                data: { ...settingsData, updatedAt: new Date() },
            });
            logger.info(`Updated ticket type settings: ${data.ticketType}`);
            return updated;
        }

        const created = await prisma.ticketTypeSettings.create({
            data: { ticketType: data.ticketType, ...settingsData },
        });
        logger.info(`Created ticket type settings: ${data.ticketType}`);
        return created;
    }

    async update(ticketType: TicketType, data: UpdateTicketTypeSettingsDto) {
        const existingSettings = await prisma.ticketTypeSettings.findUnique({
            where: { ticketType },
        });

        if (!existingSettings) {
            throw new NotFoundError(`Settings for ticket type ${ticketType} not found`);
        }

        const updated = await prisma.ticketTypeSettings.update({
            where: { ticketType },
            data: {
                ...data,
                customFields: data.customFields as any,
                updatedAt: new Date(),
            },
        });

        logger.info(`Updated ticket type settings: ${ticketType}`);
        return updated;
    }

    async getByTicketType(ticketType: TicketType) {
        const settings = await prisma.ticketTypeSettings.findUnique({
            where: { ticketType },
        });

        if (!settings) {
            const defaults = DEFAULT_WELCOME_MESSAGES[ticketType];
            return {
                ticketType,
                welcomeTitle: defaults.title,
                welcomeMessage: defaults.message,
                embedColor: DEFAULT_EMBED_COLOR,
                customFields: null,
                autoAssign: false,
                notifyOnCreate: true,
                notifyOnClose: true,
                mentionSupport: true,
                mentionCustomer: true,
                isActive: true,
            };
        }

        return settings;
    }

    async getByGroupKey(groupKey: string) {
        const settings = await prisma.ticketTypeSettings.findMany({
            where: { groupKey },
            orderBy: { displayOrder: "asc" },
        });

        if (!settings || settings.length === 0) {
            throw new NotFoundError(`No ticket types found for group: ${groupKey}`);
        }

        return settings;
    }

    async getList(query: GetTicketTypeSettingsListDto) {
        const where: any = {};

        if (query.activeOnly) {
            where.isActive = true;
        }

        return await prisma.ticketTypeSettings.findMany({
            where,
            orderBy: { ticketType: "asc" },
        });
    }

    async getAllWithDefaults() {
        const existingSettings = await prisma.ticketTypeSettings.findMany({
            orderBy: { ticketType: "asc" },
        });

        const settingsMap = new Map(existingSettings.map((s) => [s.ticketType, s]));

        return Object.values(TicketType).map((ticketType) => {
            const existing = settingsMap.get(ticketType);
            if (existing) return existing;

            const defaults = DEFAULT_WELCOME_MESSAGES[ticketType];
            return {
                id: null,
                ticketType,
                bannerUrl: null,
                thumbnailUrl: null,
                welcomeTitle: defaults.title,
                welcomeMessage: defaults.message,
                footerText: null,
                embedColor: DEFAULT_EMBED_COLOR,
                customFields: null,
                autoAssign: false,
                notifyOnCreate: true,
                notifyOnClose: true,
                mentionSupport: true,
                mentionCustomer: true,
                isActive: true,
                createdAt: null,
                updatedAt: null,
            };
        });
    }

    async delete(ticketType: TicketType) {
        const existing = await prisma.ticketTypeSettings.findUnique({
            where: { ticketType },
        });

        if (!existing) {
            throw new NotFoundError(`Settings for ticket type ${ticketType} not found`);
        }

        await prisma.ticketTypeSettings.delete({
            where: { ticketType },
        });

        logger.info(`Deleted ticket type settings: ${ticketType}`);
    }

    async initializeDefaults() {
        const created: any[] = [];

        for (const [ticketType, defaults] of Object.entries(DEFAULT_WELCOME_MESSAGES)) {
            const existing = await prisma.ticketTypeSettings.findUnique({
                where: { ticketType: ticketType as TicketType },
            });

            if (!existing) {
                const newSettings = await prisma.ticketTypeSettings.create({
                    data: {
                        ticketType: ticketType as TicketType,
                        welcomeTitle: defaults.title,
                        welcomeMessage: defaults.message,
                        embedColor: DEFAULT_EMBED_COLOR,
                        autoAssign: false,
                        notifyOnCreate: true,
                        notifyOnClose: true,
                        mentionSupport: true,
                        mentionCustomer: true,
                        isActive: true,
                    },
                });

                created.push(newSettings);
            }
        }

        if (created.length > 0) {
            logger.info(`Initialized ${created.length} default ticket type settings`);
        }

        return created;
    }

    async renderWelcomeMessage(
        ticketType: TicketType,
        variables: {
            customer?: string;
            support?: string;
            service?: string;
            price?: string;
            currency?: string;
            ticketId?: string;
        }
    ) {
        const settings = await this.getByTicketType(ticketType);

        let rendered = settings.welcomeMessage;
        Object.entries(variables).forEach(([key, value]) => {
            if (value) {
                rendered = rendered.replace(new RegExp(`\\{${key}\\}`, "g"), value);
            }
        });

        return {
            title: settings.welcomeTitle || "Support Ticket",
            message: rendered,
            bannerUrl: (settings as any).bannerUrl || null,
            thumbnailUrl: (settings as any).thumbnailUrl || null,
            embedColor: settings.embedColor || DEFAULT_EMBED_COLOR,
            footerText: (settings as any).footerText || null,
            customFields: settings.customFields || null,
            mentionCustomer: settings.mentionCustomer,
            mentionSupport: settings.mentionSupport,
        };
    }
}
