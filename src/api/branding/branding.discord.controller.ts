import { JsonController, Get, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import {
    DiscordAuthMiddleware,
    DiscordRateLimitMiddleware,
} from "../../common/middlewares/discordAuth.middleware";
import BrandingService from "./branding.service";

@JsonController("/discord/branding")
@Service()
@UseBefore(DiscordAuthMiddleware)
@UseBefore(DiscordRateLimitMiddleware)
export default class DiscordBrandingController {
    constructor(private brandingService: BrandingService) {}

    @Get("/")
    async getBranding() {
        return await this.brandingService.getAll();
    }
}
