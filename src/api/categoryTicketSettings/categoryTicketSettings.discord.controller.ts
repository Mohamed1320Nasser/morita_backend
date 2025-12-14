import { JsonController, Get, Post, Param, Body } from "routing-controllers";
import { Service } from "typedi";
import CategoryTicketSettingsService from "./categoryTicketSettings.service";

@JsonController("/discord/category-ticket-settings")
@Service()
export default class DiscordCategoryTicketSettingsController {
    constructor(
        private categoryTicketSettingsService: CategoryTicketSettingsService
    ) {}

    @Get("/category/:categoryId")
    async getSettingsByCategory(@Param("categoryId") categoryId: string) {
        return await this.categoryTicketSettingsService.getByCategoryIdOrDefault(
            categoryId
        );
    }

    @Post("/render")
    async renderWelcomeMessage(
        @Body()
        data: {
            categoryId: string;
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
        return await this.categoryTicketSettingsService.renderWelcomeMessageForCategory(
            data.categoryId,
            data.variables
        );
    }
}
