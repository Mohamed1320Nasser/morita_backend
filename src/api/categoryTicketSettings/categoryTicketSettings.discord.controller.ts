import { JsonController, Get, Post, Param, Body } from "routing-controllers";
import { Service } from "typedi";
import CategoryTicketSettingsService from "./categoryTicketSettings.service";

// Public API for Discord bot
@JsonController("/api/discord/category-ticket-settings")
@Service()
export default class DiscordCategoryTicketSettingsController {
    constructor(
        private categoryTicketSettingsService: CategoryTicketSettingsService
    ) {}

    /**
     * Get settings by category ID (with defaults if not set)
     */
    @Get("/category/:categoryId")
    async getSettingsByCategory(@Param("categoryId") categoryId: string) {
        const settings =
            await this.categoryTicketSettingsService.getByCategoryIdOrDefault(
                categoryId
            );
        return {
            success: true,
            data: settings,
        };
    }

    /**
     * Render welcome message for a ticket
     */
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
        const settings =
            await this.categoryTicketSettingsService.getByCategoryIdOrDefault(
                data.categoryId
            );

        const rendered =
            this.categoryTicketSettingsService.renderWelcomeMessage(
                settings.welcomeMessage,
                {
                    ...data.variables,
                    categoryName: settings.category?.name,
                }
            );

        return {
            success: true,
            data: {
                title: settings.welcomeTitle,
                message: rendered,
                bannerUrl: settings.bannerUrl,
                embedColor: settings.embedColor,
                footerText: settings.footerText,
            },
        };
    }
}
