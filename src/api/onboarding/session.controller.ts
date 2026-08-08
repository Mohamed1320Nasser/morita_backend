import {
    JsonController,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Authorized,
    UseBefore,
    HttpCode
} from "routing-controllers";
import { Service } from "typedi";
import OnboardingService from "./onboarding.service";
import { CreateSessionDto, UpdateSessionDto, RegisterUserDto } from "./dtos";
import { DiscordAuthMiddleware } from "../../common/middlewares/discordAuth.middleware";
import API from "../../common/config/api.types";

@JsonController("/onboarding/sessions")
@Service()
export default class SessionController {
    constructor(private onboardingService: OnboardingService) {}

    @Post("/")
    @UseBefore(DiscordAuthMiddleware)
    @HttpCode(201)
    async createSession(@Body() dto: CreateSessionDto) {
        return await this.onboardingService.createSession(dto);
    }

    @Get("/:discordId")
    @UseBefore(DiscordAuthMiddleware)
    @HttpCode(200)
    async getSession(@Param("discordId") discordId: string) {
        return await this.onboardingService.getSession(discordId);
    }

    @Patch("/:discordId")
    @UseBefore(DiscordAuthMiddleware)
    @HttpCode(200)
    async updateSession(
        @Param("discordId") discordId: string,
        @Body() dto: UpdateSessionDto
    ) {
        return await this.onboardingService.updateSession(discordId, dto);
    }

    @Post("/:discordId/complete")
    @UseBefore(DiscordAuthMiddleware)
    @HttpCode(200)
    async completeOnboarding(@Param("discordId") discordId: string) {
        return await this.onboardingService.completeOnboarding(discordId);
    }

    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getIncompleteSessions() {
        return await this.onboardingService.getIncompleteSessions();
    }
}

@JsonController("/onboarding/register")
@Service()
@UseBefore(DiscordAuthMiddleware)
export class RegistrationController {
    constructor(private onboardingService: OnboardingService) {}

    @Post("/")
    @HttpCode(201)
    async registerUser(@Body() dto: RegisterUserDto) {
        return await this.onboardingService.registerUser(dto);
    }
}
