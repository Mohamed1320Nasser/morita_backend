import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
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
        return await this.categoryTicketSettingsService.upsert(data);
    }

    @Get("/")
    async getAllSettings() {
        return await this.categoryTicketSettingsService.getAll();
    }

    @Get("/categories")
    async getAllCategoriesWithSettings() {
        return await this.categoryTicketSettingsService.getAllCategoriesWithSettings();
    }

    @Get("/:id")
    async getSettings(@Param("id") id: string) {
        return await this.categoryTicketSettingsService.getSingle(id);
    }

    @Get("/category/:categoryId")
    async getSettingsByCategory(@Param("categoryId") categoryId: string) {
        return await this.categoryTicketSettingsService.getByCategoryId(categoryId);
    }

    @Patch("/:id")
    async updateSettings(
        @Param("id") id: string,
        @Body() data: UpdateCategoryTicketSettingsDto
    ) {
        return await this.categoryTicketSettingsService.update(id, data);
    }

    @Patch("/category/:categoryId")
    async updateSettingsByCategory(
        @Param("categoryId") categoryId: string,
        @Body() data: UpdateCategoryTicketSettingsDto
    ) {
        return await this.categoryTicketSettingsService.updateByCategoryId(
            categoryId,
            data
        );
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async deleteSettings(@Param("id") id: string) {
        return await this.categoryTicketSettingsService.delete(id);
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
        return {
            rendered: this.categoryTicketSettingsService.renderWelcomeMessage(
                data.template,
                data.variables || {}
            ),
        };
    }
}
