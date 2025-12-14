import {
    JsonController,
    Get,
    Post,
    Patch,
    Param,
    Body,
} from "routing-controllers";
import { Service } from "typedi";
import TicketService from "./ticket.service";
import {
    CreateTicketFromDiscordDto,
    UpdateTicketDto,
    UpdateTicketStatusDto,
} from "./dtos";

// Public API for Discord bot - no authentication required
@JsonController("/api/discord/tickets")
@Service()
export default class DiscordTicketController {
    constructor(private ticketService: TicketService) {}

    /**
     * Create ticket from Discord bot
     */
    @Post("/")
    async createTicketFromDiscord(@Body() data: CreateTicketFromDiscordDto) {
        const ticket = await this.ticketService.createFromDiscord(data);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Get ticket by ID
     */
    @Get("/:id")
    async getTicketById(@Param("id") id: string) {
        const ticket = await this.ticketService.getSingle(id);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Get ticket by Discord channel ID
     */
    @Get("/channel/:channelId")
    async getTicketByChannel(@Param("channelId") channelId: string) {
        const ticket = await this.ticketService.getByChannelId(channelId);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Get open tickets for a customer by Discord ID
     */
    @Get("/customer/:discordId/open")
    async getOpenTicketsByCustomer(@Param("discordId") discordId: string) {
        const tickets = await this.ticketService.getOpenTicketsByCustomer(discordId);
        return {
            success: true,
            data: tickets,
        };
    }

    /**
     * Update ticket (from Discord)
     */
    @Patch("/:id")
    async updateTicket(
        @Param("id") id: string,
        @Body() data: UpdateTicketDto
    ) {
        const ticket = await this.ticketService.update(id, data);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Update ticket status (from Discord)
     */
    @Patch("/:id/status")
    async updateTicketStatus(
        @Param("id") id: string,
        @Body() data: UpdateTicketStatusDto
    ) {
        const ticket = await this.ticketService.updateStatus(id, data);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Close ticket (from Discord)
     */
    @Post("/:id/close")
    async closeTicket(
        @Param("id") id: string,
        @Body() data: { reason?: string }
    ) {
        const ticket = await this.ticketService.close(id, data.reason);
        return {
            success: true,
            data: ticket,
        };
    }

    /**
     * Add message to ticket (from Discord)
     */
    @Post("/:id/messages")
    async addMessage(
        @Param("id") id: string,
        @Body() data: {
            authorId: number;
            authorDiscordId: string;
            authorName: string;
            content: string;
            discordMessageId?: string;
            isSystem?: boolean;
        }
    ) {
        const message = await this.ticketService.addMessage(
            id,
            data.authorId,
            data.authorDiscordId,
            data.authorName,
            data.content,
            data.discordMessageId,
            data.isSystem
        );
        return {
            success: true,
            data: message,
        };
    }

    /**
     * Save ticket metadata (gold/crypto transaction details)
     */
    @Post("/:id/metadata")
    async saveTicketMetadata(
        @Param("id") ticketId: string,
        @Body() metadata: any
    ) {
        const savedMetadata = await this.ticketService.saveMetadata(ticketId, metadata);
        return {
            success: true,
            data: savedMetadata,
        };
    }

    /**
     * Get ticket metadata
     */
    @Get("/:id/metadata")
    async getTicketMetadata(@Param("id") ticketId: string) {
        const metadata = await this.ticketService.getMetadata(ticketId);
        return {
            success: true,
            data: metadata,
        };
    }
}
