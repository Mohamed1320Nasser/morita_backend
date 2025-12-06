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
import CategoryTicketSettingsService from "./categoryTicketSettings.service";
import {
    CreateCategoryTicketSettingsDto,
    UpdateCategoryTicketSettingsDto,
} from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/category-ticket-settings")
@Service()
export default class CategoryTicketSettingsController {
    constructor(
        private categoryTicketSettingsService: CategoryTicketSettingsService
    ) {}

    @Post("/")
    async upsertSettings(@Body() data: CreateCategoryTicketSettingsDto) {
        const settings = await this.categoryTicketSettingsService.upsert(data);
        return {
            success: true,
            data: settings,
        };
    }

    @Get("/")
    async getAllSettings() {
        const settings = await this.categoryTicketSettingsService.getAll();
        return {
            success: true,
            data: settings,
        };
    }

    @Get("/categories")
    async getAllCategoriesWithSettings() {
        const categories =
            await this.categoryTicketSettingsService.getAllCategoriesWithSettings();
        return {
            success: true,
            data: categories,
        };
    }

    @Get("/:id")
    async getSettings(@Param("id") id: string) {
        const settings = await this.categoryTicketSettingsService.getSingle(id);
        return {
            success: true,
            data: settings,
        };
    }

    @Get("/category/:categoryId")
    async getSettingsByCategory(@Param("categoryId") categoryId: string) {
        const settings =
            await this.categoryTicketSettingsService.getByCategoryId(categoryId);
        return {
            success: true,
            data: settings,
        };
    }

    @Patch("/:id")
    async updateSettings(
        @Param("id") id: string,
        @Body() data: UpdateCategoryTicketSettingsDto
    ) {
        const settings = await this.categoryTicketSettingsService.update(
            id,
            data
        );
        return {
            success: true,
            data: settings,
        };
    }


    @Patch("/category/:categoryId")
    async updateSettingsByCategory(
        @Param("categoryId") categoryId: string,
        @Body() data: UpdateCategoryTicketSettingsDto
    ) {
        const settings =
            await this.categoryTicketSettingsService.updateByCategoryId(
                categoryId,
                data
            );
        return {
            success: true,
            data: settings,
        };
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async deleteSettings(@Param("id") id: string) {
        const result = await this.categoryTicketSettingsService.delete(id);
        return {
            success: true,
            ...result,
        };
    }

    @Post("/preview")
    async previewWelcomeMessage(
        @Body()
        data: {
            template: string;
            variables?: {
                customer?: string;
                support?: string;
                service?: string;
                price?: string;
                currency?: string;
                ticketId?: string;
                categoryName?: string;
            };
        }
    ) {
        const rendered =
            this.categoryTicketSettingsService.renderWelcomeMessage(
                data.template,
                data.variables || {}
            );
        return {
            success: true,
            data: {
                rendered,
            },
        };
    }
}

// Discord API controller is in a separate file: categoryTicketSettings.discord.controller.ts
