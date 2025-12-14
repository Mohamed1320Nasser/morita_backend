import { JsonController, Get, Post, Param, Body } from "routing-controllers";
import { Service } from "typedi";
import TicketTypeSettingsService from "./ticketTypeSettings.service";
import { TicketType } from "@prisma/client";

@JsonController("/discord/ticket-type-settings")
@Service()
export default class DiscordTicketTypeSettingsController {
    constructor(
        private ticketTypeSettingsService: TicketTypeSettingsService
    ) {}

    @Get("/:ticketType")
    async getSettingsByType(@Param("ticketType") ticketType: string) {
        return await this.ticketTypeSettingsService.getByTicketType(
            ticketType as TicketType
        );
    }

    @Get("/all/list")
    async getAllSettings() {
        return await this.ticketTypeSettingsService.getAllWithDefaults();
    }

    @Post("/render")
    async renderWelcomeMessage(
        @Body()
        data: {
            ticketType: TicketType;
            variables: {
                customer?: string;
                support?: string;
                service?: string;
                price?: string;
                currency?: string;
                ticketId?: string;
            };
        }
    ) {
        return await this.ticketTypeSettingsService.renderWelcomeMessage(
            data.ticketType,
            data.variables
        );
    }

    @Get("/:ticketType/custom-fields")
    async getCustomFields(@Param("ticketType") ticketType: string) {
        const settings = await this.ticketTypeSettingsService.getByTicketType(
            ticketType as TicketType
        );
        return settings.customFields || { fields: [] };
    }
}
