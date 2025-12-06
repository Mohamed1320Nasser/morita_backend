import {
    JsonController,
    Get,
    Post,
    Patch,
    Param,
    Body,
    QueryParams,
} from "routing-controllers";
import { Service } from "typedi";
import TicketService from "./ticket.service";
import {
    CreateTicketDto,
    UpdateTicketDto,
    UpdateTicketStatusDto,
    GetTicketListDto,
    AssignSupportDto,
} from "./dtos";

// Admin API - requires authentication
@JsonController("/tickets")
@Service()
export default class TicketController {
    constructor(private ticketService: TicketService) {}

    @Post("/")
    async createTicket(@Body() data: CreateTicketDto) {
        const ticket = await this.ticketService.create(data);
        return {
            success: true,
            data: ticket,
        };
    }

    @Get("/")
    async getTickets(@QueryParams() query: GetTicketListDto) {
        const result = await this.ticketService.getList(query);
        return {
            success: true,
            ...result,
        };
    }

    @Get("/stats")
    async getTicketStats() {
        const stats = await this.ticketService.getStats();
        return {
            success: true,
            data: stats,
        };
    }

    @Get("/:id")
    async getTicket(@Param("id") id: string) {
        const ticket = await this.ticketService.getSingle(id);
        return {
            success: true,
            data: ticket,
        };
    }

    @Get("/number/:ticketNumber")
    async getTicketByNumber(@Param("ticketNumber") ticketNumber: number) {
        const ticket = await this.ticketService.getByTicketNumber(ticketNumber);
        return {
            success: true,
            data: ticket,
        };
    }

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

    @Patch("/:id/assign")
    async assignSupport(
        @Param("id") id: string,
        @Body() data: AssignSupportDto
    ) {
        const ticket = await this.ticketService.assignSupport(id, data);
        return {
            success: true,
            data: ticket,
        };
    }

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

    @Get("/:id/messages")
    async getTicketMessages(
        @Param("id") id: string,
        @QueryParams() query: { limit?: number; offset?: number }
    ) {
        const messages = await this.ticketService.getMessages(
            id,
            query.limit || 50,
            query.offset || 0
        );
        return {
            success: true,
            data: messages,
        };
    }
}

// Discord API controller is in a separate file: ticket.discord.controller.ts
