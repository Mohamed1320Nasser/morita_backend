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
import axios from "axios";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Environment } from "../../common/config/environment";

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
            // The reason was shown in Discord and then lost
            if (data.reason?.trim()) {
                updateData.closeReason = data.reason.trim().slice(0, 500);
            }
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
     * Asks the bot to close the ticket's Discord channel the same way a close
     * from Discord does (close message, buttons disabled, transcript, ticket
     * log). Used when a ticket is closed from the dashboard, which otherwise
     * only changed the database and left the channel open.
     *
     * Best effort: the ticket is already closed in the database, so a bot
     * outage is logged rather than failing the request.
     */
    async closeInDiscord(ticketId: string, adminUserId?: number, reason?: string) {
        try {
            const admin = adminUserId
                ? await prisma.user.findUnique({ where: { id: adminUserId }, select: { discordId: true } })
                : null;

            const botApiUrl = process.env.BOT_API_URL || "http://localhost:3002";
            await axios.post(
                `${botApiUrl}/discord/tickets/close`,
                { ticketId, closedByDiscordId: admin?.discordId || null, reason },
                { timeout: 15000, headers: { "X-API-Key": process.env.DISCORD_BOT_API_KEY || "" } }
            );
        } catch (error: any) {
            logger.warn(
                `[TicketService] Ticket ${ticketId} closed in the database but not in Discord: ` +
                    `${error?.response?.data?.error || error?.message}`
            );
        }
    }

    // ============================================
    // TRANSCRIPTS
    // ============================================

    /**
     * Stores the HTML transcript the bot generates when a ticket closes.
     *
     * The bot uploads it in pieces (each well under nginx's default 1 MB body
     * limit) as raw bytes; pieces are appended to a temporary file and the
     * last one finalises it. Kept in a private folder (not the public CDN)
     * under a random name; a ticket closed again replaces its old transcript.
     */
    async saveTranscriptChunk(
        id: string,
        params: { uploadId: string; part: number; parts: number; offset: number },
        chunk: Buffer
    ) {
        const { uploadId, part, parts, offset } = params;

        if (!/^[0-9a-f-]{36}$/i.test(uploadId || "")) throw new BadRequestError("Invalid uploadId");
        if (!Number.isInteger(parts) || parts < 1 || parts > 200) throw new BadRequestError("Invalid parts");
        if (!Number.isInteger(part) || part < 0 || part >= parts) throw new BadRequestError("Invalid part");
        if (!Number.isInteger(offset) || offset < 0) throw new BadRequestError("Invalid offset");
        if (!Buffer.isBuffer(chunk) || chunk.length === 0) throw new BadRequestError("Empty transcript chunk");

        const ticket = await prisma.ticket.findUnique({
            where: { id },
            select: { id: true, ticketNumber: true, transcriptFile: true },
        });
        if (!ticket) throw new NotFoundError("Ticket not found");

        const dir = path.resolve(Environment.project.transcriptsDir);
        const partialDir = path.join(dir, ".partial");
        await fs.promises.mkdir(partialDir, { recursive: true });
        const partialPath = path.join(partialDir, `${ticket.id}-${uploadId}.part`);

        // `offset` is where this piece starts. A retried piece that already
        // landed (reply lost) is skipped instead of appended twice, and a gap
        // is refused, so the assembled file is always byte-for-byte correct.
        if (part === 0 && offset === 0) {
            await this.removeStalePartials(partialDir);
            await fs.promises.writeFile(partialPath, chunk);
        } else {
            const current = await fs.promises.stat(partialPath).then(st => st.size).catch(() => -1);
            if (current === -1) throw new BadRequestError("Upload not started or expired");

            if (current === offset) {
                await fs.promises.appendFile(partialPath, chunk);
            } else if (current !== offset + chunk.length) {
                throw new BadRequestError(`Transcript piece out of order (have ${current} bytes, piece starts at ${offset})`);
            }
        }

        if (part < parts - 1) {
            return { complete: false, received: part + 1, parts };
        }

        const fileName = `ticket-${String(ticket.ticketNumber).padStart(4, "0")}-${randomUUID()}.html`;
        await fs.promises.rename(partialPath, path.join(dir, fileName));
        const { size } = await fs.promises.stat(path.join(dir, fileName));

        await prisma.ticket.update({
            where: { id },
            data: { transcriptFile: fileName, transcriptCreatedAt: new Date() },
        });

        if (ticket.transcriptFile && ticket.transcriptFile !== fileName) {
            await fs.promises.unlink(path.join(dir, path.basename(ticket.transcriptFile))).catch(() => {});
        }

        logger.info(`[TicketService] Saved transcript for ticket #${ticket.ticketNumber} (${Math.round(size / 1024)} KB, ${parts} part(s))`);
        return { complete: true, transcriptFile: fileName, size };
    }

    /** Uploads abandoned midway (bot restart, network error) are dropped after an hour. */
    private async removeStalePartials(partialDir: string) {
        const cutoff = Date.now() - 60 * 60 * 1000;
        const entries = await fs.promises.readdir(partialDir).catch(() => [] as string[]);
        for (const entry of entries) {
            const full = path.join(partialDir, entry);
            const stat = await fs.promises.stat(full).catch(() => null);
            if (stat && stat.mtimeMs < cutoff) await fs.promises.unlink(full).catch(() => {});
        }
    }

    async getTranscript(id: string) {
        const ticket = await prisma.ticket.findUnique({
            where: { id },
            select: { ticketNumber: true, transcriptFile: true },
        });
        if (!ticket) throw new NotFoundError("Ticket not found");
        if (!ticket.transcriptFile) throw new NotFoundError("No transcript saved for this ticket");

        // basename(): the stored value is only ever a file name, never a path
        const filePath = path.join(path.resolve(Environment.project.transcriptsDir), path.basename(ticket.transcriptFile));

        try {
            const html = await fs.promises.readFile(filePath, "utf8");
            return { html, fileName: `ticket-${String(ticket.ticketNumber).padStart(4, "0")}.html` };
        } catch {
            throw new NotFoundError("Transcript file is missing from storage");
        }
    }

    /**
     * Record customer feedback on a ticket.
     *
     * Only the customer who opened it may review, and only once, matching how
     * order reviews behave.
     */
    async addReview(
        id: string,
        data: { customerDiscordId: string; rating: number; review?: string }
    ) {
        if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5) {
            throw new BadRequestError("Rating must be a whole number between 1 and 5");
        }

        const ticket = await prisma.ticket.findUnique({
            where: { id },
            include: { customer: { select: { discordId: true } } },
        });

        if (!ticket) {
            throw new NotFoundError("Ticket not found");
        }

        if (ticket.customer?.discordId !== data.customerDiscordId) {
            throw new BadRequestError("You are not the customer for this ticket");
        }

        if (ticket.rating || ticket.review) {
            throw new BadRequestError("Ticket has already been reviewed");
        }

        return prisma.ticket.update({
            where: { id },
            data: {
                rating: data.rating,
                review: data.review?.trim() || null,
                reviewedAt: new Date(),
            },
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
        isSystem: boolean = false,
        isWelcome: boolean = false
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
                isWelcome,
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

    async getTicketsWithFirstResponseForKPI(filter: {
        startDate?: Date;
        endDate?: Date;
        ticketType?: string;
        supportUserId?: number;
    }) {
        const ticketFilter: any = {
            createdAt: filter.startDate || filter.endDate
                ? {
                    ...(filter.startDate && { gte: filter.startDate }),
                    ...(filter.endDate && { lte: filter.endDate })
                  }
                : undefined,
        };

        if (filter.ticketType) {
            ticketFilter.ticketType = filter.ticketType;
        }

        const messageFilter: any = {
            isSystem: false,
            isWelcome: false,
            author: {
                discordRole: { in: ['admin', 'support'] }
            }
        };

        if (filter.supportUserId) {
            messageFilter.authorId = filter.supportUserId;
        }

        return await prisma.ticket.findMany({
            where: ticketFilter,
            select: {
                id: true,
                ticketNumber: true,
                ticketType: true,
                createdAt: true,
                messages: {
                    where: messageFilter,
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: {
                        id: true,
                        content: true,
                        createdAt: true,
                        authorId: true,
                        author: {
                            select: {
                                id: true,
                                fullname: true,
                                username: true,
                                discordUsername: true
                            }
                        }
                    }
                }
            }
        });
    }

    async getTicketsWithOrdersForKPI(filter: {
        startDate?: Date;
        endDate?: Date;
        ticketType?: string;
    }) {
        const ticketFilter: any = {
            createdAt: filter.startDate || filter.endDate
                ? {
                    ...(filter.startDate && { gte: filter.startDate }),
                    ...(filter.endDate && { lte: filter.endDate })
                  }
                : undefined,
        };

        if (filter.ticketType) {
            ticketFilter.ticketType = filter.ticketType;
        }

        return await prisma.ticket.findMany({
            where: ticketFilter,
            select: {
                id: true,
                ticketNumber: true,
                ticketType: true,
                createdAt: true,
                orders: {
                    orderBy: { createdAt: 'asc' },
                    take: 1,
                    select: {
                        id: true,
                        createdAt: true,
                        serviceId: true,
                        service: {
                            select: {
                                id: true,
                                name: true
                            }
                        },
                        services: {
                            select: {
                                service: { select: { id: true, name: true } }
                            },
                            orderBy: { position: "asc" }
                        }
                    }
                }
            }
        });
    }

    async getTicketsForPeakTimesKPI(filter: {
        startDate?: Date;
        endDate?: Date;
        ticketType?: string;
    }) {
        const where: any = {
            createdAt: filter.startDate || filter.endDate
                ? {
                    ...(filter.startDate && { gte: filter.startDate }),
                    ...(filter.endDate && { lte: filter.endDate })
                  }
                : undefined,
        };

        if (filter.ticketType) {
            where.ticketType = filter.ticketType;
        }

        return await prisma.ticket.findMany({
            where,
            select: {
                id: true,
                createdAt: true,
                ticketType: true
            }
        });
    }

    async getTicketMessagesForReplySpeedKPI(filter: {
        startDate?: Date;
        endDate?: Date;
        ticketType?: string;
    }) {
        const where: any = {
            createdAt: filter.startDate || filter.endDate
                ? {
                    ...(filter.startDate && { gte: filter.startDate }),
                    ...(filter.endDate && { lte: filter.endDate })
                  }
                : undefined,
        };

        if (filter.ticketType) {
            where.ticket = { ticketType: filter.ticketType };
        }

        return await prisma.ticketMessage.findMany({
            where,
            select: {
                id: true,
                ticketId: true,
                content: true,
                createdAt: true,
                author: {
                    select: {
                        id: true,
                        fullname: true,
                        role: true,
                        discordRole: true
                    }
                },
                ticket: {
                    select: {
                        ticketNumber: true,
                        ticketType: true
                    }
                }
            },
            orderBy: [
                { ticketId: 'asc' },
                { createdAt: 'asc' }
            ]
        });
    }
}
