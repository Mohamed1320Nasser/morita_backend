import { Service } from "typedi";
import prisma from "../../common/prisma/client";
import {
    CreateTicketDto,
    CreateTicketFromDiscordDto,
    UpdateTicketDto,
    UpdateTicketStatusDto,
    GetTicketListDto,
    AssignSupportDto,
} from "./dtos";
import { NotFoundError, BadRequestError } from "routing-controllers";
import { TicketStatus, TicketType } from "@prisma/client";
import logger from "../../common/loggers";

@Service()
export default class TicketService {
    constructor() {}

    /**
     * Create a new ticket
     */
    async create(data: CreateTicketDto, ticketType?: TicketType) {
        logger.info(`[TicketService] Creating ticket with categoryId: ${JSON.stringify(data.categoryId)}, accountId: ${data.accountId}, customerDiscordId: ${data.customerDiscordId}, ticketType: ${ticketType}`);

        // Verify the category exists (only if categoryId is provided and not empty)
        if (data.categoryId && data.categoryId.trim() !== "") {
            const category = await prisma.serviceCategory.findUnique({
                where: { id: data.categoryId },
            });

            if (!category) {
                logger.error(`[TicketService] Category not found: ${data.categoryId}`);
                throw new NotFoundError("Category not found");
            }
        } else {
            logger.info(`[TicketService] No categoryId provided or empty, skipping category validation`);
        }

        // Verify service exists if provided
        if (data.serviceId) {
            const service = await prisma.service.findUnique({
                where: { id: data.serviceId },
            });
            if (!service) {
                throw new NotFoundError("Service not found");
            }
        }

        // Verify payment method exists if provided
        if (data.paymentMethodId) {
            const paymentMethod = await prisma.paymentMethod.findUnique({
                where: { id: data.paymentMethodId },
            });
            if (!paymentMethod) {
                throw new NotFoundError("Payment method not found");
            }
        }

        const ticket = await prisma.ticket.create({
            data: {
                customerId: data.customerId,
                customerDiscordId: data.customerDiscordId,
                categoryId: (data.categoryId && data.categoryId.trim() !== "") ? data.categoryId : undefined,
                serviceId: data.serviceId,
                accountId: data.accountId,
                channelId: data.channelId,
                calculatedPrice: data.calculatedPrice,
                paymentMethodId: data.paymentMethodId,
                currency: data.currency || "USD",
                customerNotes: data.customerNotes,
                status: TicketStatus.OPEN,
                ticketType: ticketType || TicketType.GENERAL,
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
                paymentMethod: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
            },
        });

        logger.info(`Ticket created: #${ticket.ticketNumber} by customer ${data.customerId}, accountId: ${ticket.accountId}, customerDiscordId: ${ticket.customerDiscordId}`);

        return ticket;
    }

    /**
     * Create ticket from Discord interaction
     * This will create or find the user first, then create the ticket
     */
    async createFromDiscord(data: CreateTicketFromDiscordDto) {
        // Find or create user by Discord ID
        let user = await prisma.user.findUnique({
            where: { discordId: data.customerDiscordId },
        });

        if (!user) {
            // Create new user from Discord
            user = await prisma.user.create({
                data: {
                    discordId: data.customerDiscordId,
                    fullname: data.customerName,
                    email: data.customerEmail || `${data.customerDiscordId}@discord.morita.local`,
                    emailIsVerified: false,
                    discordRole: (data.customerDiscordRole as any) || "customer",
                },
            });
            logger.info(`Created new user from Discord: ${user.id} (${data.customerDiscordId}) with role ${data.customerDiscordRole || 'customer'}`);
        }

        // Create the ticket
        const ticket = await this.create({
            customerId: user.id,
            customerDiscordId: data.customerDiscordId,
            categoryId: data.categoryId,
            serviceId: data.serviceId,
            accountId: data.accountId,
            channelId: data.channelId,
            calculatedPrice: data.calculatedPrice,
            paymentMethodId: data.paymentMethodId,
            currency: data.currency,
            customerNotes: data.customerNotes,
        }, data.ticketType as any);

        return ticket;
    }

    /**
     * Get paginated list of tickets
     */
    async getList(query: GetTicketListDto) {
        const {
            search,
            status,
            categoryId,
            customerId,
            supportId,
            customerDiscordId,
            page = 1,
            limit = 10,
            sortBy = "createdAt",
            sortOrder = "desc",
        } = query;

        const skip = (page - 1) * limit;

        const where: any = {};

        if (status) {
            where.status = status;
        }

        if (categoryId) {
            where.categoryId = categoryId;
        }

        if (customerId) {
            where.customerId = customerId;
        }

        if (supportId) {
            where.supportId = supportId;
        }

        if (customerDiscordId) {
            where.customerDiscordId = customerDiscordId;
        }

        if (search) {
            where.OR = [
                { ticketNumber: !isNaN(Number(search)) ? Number(search) : undefined },
                { customerNotes: { contains: search } },
                { customer: { fullname: { contains: search } } },
                { customer: { email: { contains: search } } },
            ].filter(Boolean);
        }

        const [tickets, total] = await Promise.all([
            prisma.ticket.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    [sortBy]: sortOrder,
                },
                include: {
                    customer: {
                        select: {
                            id: true,
                            fullname: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    support: {
                        select: {
                            id: true,
                            fullname: true,
                            email: true,
                            discordId: true,
                        },
                    },
                    category: {
                        select: {
                            id: true,
                            name: true,
                            emoji: true,
                        },
                    },
                    service: {
                        select: {
                            id: true,
                            name: true,
                            emoji: true,
                        },
                    },
                    _count: {
                        select: {
                            messages: true,
                            orders: true,
                        },
                    },
                },
            }),
            prisma.ticket.count({ where }),
        ]);

        return {
            list: tickets,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    /**
     * Get single ticket by ID
     */
    async getSingle(id: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                support: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                        slug: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                        slug: true,
                    },
                },
                paymentMethod: {
                    select: {
                        id: true,
                        name: true,
                        type: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 50,
                },
                orders: {
                    orderBy: { createdAt: "desc" },
                },
                account: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        category: true,
                        status: true,
                    },
                },
            },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        logger.info(`[TicketService] getSingle returning ticket ${id} with accountId: ${ticket.accountId}, customerDiscordId: ${ticket.customerDiscordId}, account: ${ticket.account?.id || 'none'}`);
        return ticket;
    }

    /**
     * Get ticket by Discord channel ID
     */
    async getByChannelId(channelId: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { channelId },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                support: {
                    select: {
                        id: true,
                        fullname: true,
                        email: true,
                        discordId: true,
                    },
                },
                category: {
                    include: {
                        ticketSettings: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
                paymentMethod: true,
            },
        });

        return ticket;
    }

    /**
     * Get ticket by ticket number
     */
    async getByTicketNumber(ticketNumber: number) {
        const ticket = await prisma.ticket.findUnique({
            where: { ticketNumber },
            include: {
                customer: true,
                support: true,
                category: true,
                service: true,
                paymentMethod: true,
            },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        return ticket;
    }

    /**
     * Get open tickets for a customer
     */
    async getOpenTicketsByCustomer(customerDiscordId: string) {
        const tickets = await prisma.ticket.findMany({
            where: {
                customerDiscordId,
                status: {
                    in: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS],
                },
            },
            include: {
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        return tickets;
    }

    /**
     * Update ticket
     */
    async update(id: string, data: UpdateTicketDto) {
        const ticket = await prisma.ticket.findUnique({
            where: { id },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        const updatedTicket = await prisma.ticket.update({
            where: { id },
            data: {
                ...data,
                updatedAt: new Date(),
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        discordId: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
                service: {
                    select: {
                        id: true,
                        name: true,
                        emoji: true,
                    },
                },
            },
        });

        logger.info(`Ticket updated: #${ticket.ticketNumber}`);

        return updatedTicket;
    }

    /**
     * Update ticket status
     */
    async updateStatus(id: string, data: UpdateTicketStatusDto) {
        const ticket = await prisma.ticket.findUnique({
            where: { id },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        // Validate status transitions
        const validTransitions: Record<TicketStatus, TicketStatus[]> = {
            [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED, TicketStatus.CANCELLED],
            [TicketStatus.IN_PROGRESS]: [TicketStatus.AWAITING_CONFIRMATION, TicketStatus.CANCELLED, TicketStatus.CLOSED],
            [TicketStatus.AWAITING_CONFIRMATION]: [TicketStatus.COMPLETED, TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED, TicketStatus.CLOSED], // Allow manual close
            [TicketStatus.COMPLETED]: [TicketStatus.CLOSED], // Allow manual close after completion
            [TicketStatus.CANCELLED]: [], // Final state
            [TicketStatus.CLOSED]: [], // Final state
        };

        if (!validTransitions[ticket.status].includes(data.status)) {
            throw new BadRequestError(
                `Cannot transition from ${ticket.status} to ${data.status}`
            );
        }

        const updateData: any = {
            status: data.status,
            updatedAt: new Date(),
        };

        // Set closedAt for terminal states
        const terminalStatuses: TicketStatus[] = [TicketStatus.COMPLETED, TicketStatus.CANCELLED, TicketStatus.CLOSED];
        if (terminalStatuses.includes(data.status)) {
            updateData.closedAt = new Date();
        }

        const updatedTicket = await prisma.ticket.update({
            where: { id },
            data: updateData,
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        discordId: true,
                    },
                },
                category: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        logger.info(`Ticket #${ticket.ticketNumber} status changed: ${ticket.status} -> ${data.status}`);

        return updatedTicket;
    }

    /**
     * Assign support to ticket
     */
    async assignSupport(id: string, data: AssignSupportDto) {
        const ticket = await prisma.ticket.findUnique({
            where: { id },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        const updatedTicket = await prisma.ticket.update({
            where: { id },
            data: {
                supportId: data.supportId,
                supportDiscordId: data.supportDiscordId,
                updatedAt: new Date(),
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        fullname: true,
                        discordId: true,
                    },
                },
                support: {
                    select: {
                        id: true,
                        fullname: true,
                        discordId: true,
                    },
                },
            },
        });

        logger.info(`Ticket #${ticket.ticketNumber} assigned to support: ${data.supportId}`);

        return updatedTicket;
    }

    /**
     * Close ticket
     */
    async close(id: string, reason?: string) {
        return this.updateStatus(id, {
            status: TicketStatus.CLOSED,
            reason,
        });
    }

    /**
     * Get ticket statistics
     */
    async getStats() {
        const [
            totalTickets,
            openTickets,
            inProgressTickets,
            completedTickets,
            todayTickets,
        ] = await Promise.all([
            prisma.ticket.count(),
            prisma.ticket.count({ where: { status: TicketStatus.OPEN } }),
            prisma.ticket.count({ where: { status: TicketStatus.IN_PROGRESS } }),
            prisma.ticket.count({ where: { status: TicketStatus.COMPLETED } }),
            prisma.ticket.count({
                where: {
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    },
                },
            }),
        ]);

        return {
            total: totalTickets,
            open: openTickets,
            inProgress: inProgressTickets,
            completed: completedTickets,
            today: todayTickets,
        };
    }

    /**
     * Add message to ticket
     */
    async addMessage(
        ticketId: string,
        authorId: number,
        authorDiscordId: string,
        authorName: string,
        content: string,
        discordMessageId?: string,
        isSystem: boolean = false
    ) {
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        const message = await prisma.ticketMessage.create({
            data: {
                ticketId,
                authorId,
                authorDiscordId,
                authorName,
                content,
                discordMessageId,
                isSystem,
            },
        });

        return message;
    }

    /**
     * Get messages for a ticket
     */
    async getMessages(ticketId: string, limit: number = 50, offset: number = 0) {
        const messages = await prisma.ticketMessage.findMany({
            where: { ticketId },
            orderBy: { createdAt: "asc" },
            take: limit,
            skip: offset,
            include: {
                author: {
                    select: {
                        id: true,
                        fullname: true,
                        discordId: true,
                    },
                },
            },
        });

        return messages;
    }

    /**
     * Save ticket metadata (for gold/crypto transactions)
     */
    async saveMetadata(ticketId: string, metadata: any) {
        // Check if ticket exists
        const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        // Upsert metadata
        const savedMetadata = await prisma.ticketMetadata.upsert({
            where: { ticketId },
            create: {
                ticketId,
                ...metadata,
            },
            update: metadata,
        });

        logger.info(`Ticket metadata saved for ticket ${ticketId}`);
        return savedMetadata;
    }

    /**
     * Get ticket metadata
     */
    async getMetadata(ticketId: string) {
        const metadata = await prisma.ticketMetadata.findUnique({
            where: { ticketId },
        });

        return metadata;
    }
}
