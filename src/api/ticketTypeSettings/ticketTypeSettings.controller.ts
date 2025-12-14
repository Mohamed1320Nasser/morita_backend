import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import TicketTypeSettingsService from "./ticketTypeSettings.service";
import {
    CreateTicketTypeSettingsDto,
    UpdateTicketTypeSettingsDto,
    GetTicketTypeSettingsListDto,
} from "./dtos";
import { TicketType } from "@prisma/client";
import API from "../../common/config/api.types";

@JsonController("/ticket-type-settings")
@Service()
export default class TicketTypeSettingsController {
    constructor(
        private ticketTypeSettingsService: TicketTypeSettingsService
    ) {}

    @Post("/")
    @Authorized([API.Role.admin])
    async upsertSettings(@Body() data: CreateTicketTypeSettingsDto) {
        return await this.ticketTypeSettingsService.upsert(data);
    }

    @Get("/")
    async getAllSettings(@QueryParams() query: GetTicketTypeSettingsListDto) {
        return await this.ticketTypeSettingsService.getList(query);
    }

    @Get("/all-with-defaults")
    async getAllWithDefaults() {
        return await this.ticketTypeSettingsService.getAllWithDefaults();
    }

    @Get("/group/:groupKey")
    async getSettingsByGroup(@Param("groupKey") groupKey: string) {
        return await this.ticketTypeSettingsService.getByGroupKey(groupKey);
    }

    @Get("/:ticketType")
    async getSettingsByType(@Param("ticketType") ticketType: string) {
        return await this.ticketTypeSettingsService.getByTicketType(
            ticketType as TicketType
        );
    }

    @Patch("/:ticketType")
    @Authorized([API.Role.admin])
    async updateSettings(
        @Param("ticketType") ticketType: string,
        @Body() data: UpdateTicketTypeSettingsDto
    ) {
        return await this.ticketTypeSettingsService.update(
            ticketType as TicketType,
            data
        );
    }

    @Delete("/:ticketType")
    @Authorized(API.Role.admin)
    async deleteSettings(@Param("ticketType") ticketType: string) {
        await this.ticketTypeSettingsService.delete(ticketType as TicketType);
        return `Settings for ${ticketType} deleted. Reverted to defaults.`;
    }

    @Post("/initialize-defaults")
    @Authorized(API.Role.admin)
    async initializeDefaults() {
        const created = await this.ticketTypeSettingsService.initializeDefaults();
        return {
            list: created,
            count: created.length,
        };
    }
}
