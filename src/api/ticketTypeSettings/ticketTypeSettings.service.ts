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
    [TicketType.PURCHASE_ACCOUNT]: {
        title: "🎮 Account Purchase",
        message: `Hello {customer}!

Thank you for your interest in purchasing an OSRS account. Our team ({support}) will assist you shortly.

**Ticket ID:** #{ticket_id}
**Account:** {account_name}
**Price:** {price} {currency}

**What happens next:**
1. Please confirm your payment method preference
2. Once payment is verified, we'll prepare the account credentials
3. You'll receive the full login details securely in this channel
4. We'll assist you with the initial login and security setup

**Important:** Please ensure you change the password and set up 2FA immediately after receiving the account.

Thank you for choosing us!`,
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
        let settings = await prisma.ticketTypeSettings.findMany({
            where: { groupKey },
            orderBy: { displayOrder: "asc" },
        });

        // If no settings found, try to auto-initialize defaults for this group
        if (!settings || settings.length === 0) {
            logger.info(`No ticket types found for group: ${groupKey}, attempting to auto-initialize...`);

            // Find which ticket types belong to this group and create them
            const GROUP_TO_TYPES: Record<string, TicketType[]> = {
                "services": [TicketType.PURCHASE_SERVICES_OSRS, TicketType.PURCHASE_SERVICES_RS3],
                "buy-gold": [TicketType.BUY_GOLD_OSRS, TicketType.BUY_GOLD_RS3],
                "sell-gold": [TicketType.SELL_GOLD_OSRS, TicketType.SELL_GOLD_RS3],
                "crypto-swap": [TicketType.SWAP_CRYPTO],
                "account-purchase": [TicketType.PURCHASE_ACCOUNT],
                "general": [TicketType.GENERAL],
            };

            const typesToCreate = GROUP_TO_TYPES[groupKey];
            if (typesToCreate && typesToCreate.length > 0) {
                // Initialize these types
                await this.initializeDefaults();

                // Fetch again
                settings = await prisma.ticketTypeSettings.findMany({
                    where: { groupKey },
                    orderBy: { displayOrder: "asc" },
                });
            }
        }

        if (!settings || settings.length === 0) {
            logger.warn(`No ticket types found for group: ${groupKey} even after initialization`);
            return [];
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

        // Default group configs for fallback
        const DEFAULT_GROUP_CONFIG: Record<string, { groupKey: string; buttonLabel: string; buttonColor: string; displayOrder: number }> = {
            [TicketType.PURCHASE_SERVICES_OSRS]: { groupKey: "services", buttonLabel: "OSRS Services", buttonColor: "blue", displayOrder: 1 },
            [TicketType.PURCHASE_SERVICES_RS3]: { groupKey: "services", buttonLabel: "RS3 Services", buttonColor: "blue", displayOrder: 2 },
            [TicketType.BUY_GOLD_OSRS]: { groupKey: "buy-gold", buttonLabel: "Buy OSRS Gold", buttonColor: "gold", displayOrder: 1 },
            [TicketType.BUY_GOLD_RS3]: { groupKey: "buy-gold", buttonLabel: "Buy RS3 Gold", buttonColor: "gold", displayOrder: 2 },
            [TicketType.SELL_GOLD_OSRS]: { groupKey: "sell-gold", buttonLabel: "Sell OSRS Gold", buttonColor: "green", displayOrder: 1 },
            [TicketType.SELL_GOLD_RS3]: { groupKey: "sell-gold", buttonLabel: "Sell RS3 Gold", buttonColor: "green", displayOrder: 2 },
            [TicketType.SWAP_CRYPTO]: { groupKey: "crypto-swap", buttonLabel: "Crypto Swap", buttonColor: "orange", displayOrder: 1 },
            [TicketType.PURCHASE_ACCOUNT]: { groupKey: "account-purchase", buttonLabel: "Buy Account", buttonColor: "gold", displayOrder: 1 },
            [TicketType.GENERAL]: { groupKey: "general", buttonLabel: "General Support", buttonColor: "gray", displayOrder: 1 },
        };

        return Object.values(TicketType).map((ticketType) => {
            const existing = settingsMap.get(ticketType);
            if (existing) return existing;

            const defaults = DEFAULT_WELCOME_MESSAGES[ticketType];
            const groupConfig = DEFAULT_GROUP_CONFIG[ticketType];
            return {
                id: null,
                ticketType,
                groupKey: groupConfig?.groupKey || "general",
                buttonLabel: groupConfig?.buttonLabel || ticketType,
                buttonColor: groupConfig?.buttonColor || "gray",
                displayOrder: groupConfig?.displayOrder || 0,
                bannerUrl: null,
                thumbnailUrl: null,
                welcomeTitle: defaults.title,
                welcomeMessage: defaults.message,
                footerText: null,
                embedColor: ticketType === TicketType.PURCHASE_ACCOUNT ? "C9A961" : DEFAULT_EMBED_COLOR,
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

        // Define group and button settings for each ticket type
        const TICKET_TYPE_CONFIG: Record<TicketType, {
            groupKey: string;
            buttonLabel: string;
            buttonColor: string;
            displayOrder: number;
            embedColor?: string;
        }> = {
            [TicketType.PURCHASE_SERVICES_OSRS]: {
                groupKey: "services",
                buttonLabel: "OSRS Services",
                buttonColor: "blue",
                displayOrder: 1,
            },
            [TicketType.PURCHASE_SERVICES_RS3]: {
                groupKey: "services",
                buttonLabel: "RS3 Services",
                buttonColor: "blue",
                displayOrder: 2,
            },
            [TicketType.BUY_GOLD_OSRS]: {
                groupKey: "buy-gold",
                buttonLabel: "Buy OSRS Gold",
                buttonColor: "gold",
                displayOrder: 1,
            },
            [TicketType.BUY_GOLD_RS3]: {
                groupKey: "buy-gold",
                buttonLabel: "Buy RS3 Gold",
                buttonColor: "gold",
                displayOrder: 2,
            },
            [TicketType.SELL_GOLD_OSRS]: {
                groupKey: "sell-gold",
                buttonLabel: "Sell OSRS Gold",
                buttonColor: "green",
                displayOrder: 1,
            },
            [TicketType.SELL_GOLD_RS3]: {
                groupKey: "sell-gold",
                buttonLabel: "Sell RS3 Gold",
                buttonColor: "green",
                displayOrder: 2,
            },
            [TicketType.SWAP_CRYPTO]: {
                groupKey: "crypto-swap",
                buttonLabel: "Crypto Swap",
                buttonColor: "orange",
                displayOrder: 1,
            },
            [TicketType.PURCHASE_ACCOUNT]: {
                groupKey: "account-purchase",
                buttonLabel: "Buy Account",
                buttonColor: "gold",
                displayOrder: 1,
                embedColor: "C9A961",
            },
            [TicketType.GENERAL]: {
                groupKey: "general",
                buttonLabel: "General Support",
                buttonColor: "gray",
                displayOrder: 1,
            },
        };

        for (const [ticketType, defaults] of Object.entries(DEFAULT_WELCOME_MESSAGES)) {
            const existing = await prisma.ticketTypeSettings.findUnique({
                where: { ticketType: ticketType as TicketType },
            });

            if (!existing) {
                const config = TICKET_TYPE_CONFIG[ticketType as TicketType];
                const newSettings = await prisma.ticketTypeSettings.create({
                    data: {
                        ticketType: ticketType as TicketType,
                        welcomeTitle: defaults.title,
                        welcomeMessage: defaults.message,
                        embedColor: config?.embedColor || DEFAULT_EMBED_COLOR,
                        groupKey: config?.groupKey || "general",
                        buttonLabel: config?.buttonLabel || ticketType,
                        buttonColor: config?.buttonColor || "gray",
                        displayOrder: config?.displayOrder || 0,
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
