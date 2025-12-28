import {
    JsonController,
    Get,
    Post,
    Put,
    Body,
    Param,
    Authorized,
    HttpCode
} from "routing-controllers";
import { Service } from "typedi";
import OnboardingService from "./onboarding.service";
import { CreateTosDto, UpdateTosDto, AcceptTosDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/onboarding/tos")
@Service()
export default class TosController {
    constructor(private onboardingService: OnboardingService) {}

    // Get active TOS (for Discord bot and public)
    @Get("/active")
    @HttpCode(200)
    async getActiveTos() {
        return await this.onboardingService.getActiveTos();
    }

    // Get TOS by ID
    @Get("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getTosById(@Param("id") id: string) {
        return await this.onboardingService.getTosById(id);
    }

    // Get all TOS versions
    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAllTos() {
        return await this.onboardingService.getAllTos();
    }

    // Create new TOS version (Admin only)
    @Post("/")
    @Authorized(API.Role.admin)
    @HttpCode(201)
    async createTos(@Body() dto: CreateTosDto) {
        return await this.onboardingService.createTos(dto);
    }

    // Update TOS (Admin only)
    @Put("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async updateTos(@Param("id") id: string, @Body() dto: UpdateTosDto) {
        return await this.onboardingService.updateTos(id, dto);
    }

    // Publish TOS to Discord (Admin only)
    @Post("/:id/publish")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async publishToDiscord(@Param("id") id: string) {
        return await this.onboardingService.publishTosToDiscord(id);
    }

    // Record user TOS acceptance (called by Discord bot)
    @Post("/accept")
    @HttpCode(201)
    async acceptTos(@Body() dto: AcceptTosDto) {
        return await this.onboardingService.recordAcceptance(dto);
    }

    // Get TOS acceptance statistics (Admin only)
    @Get("/:id/stats")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getTosStats(@Param("id") id: string) {
        return await this.onboardingService.getAcceptanceStats(id);
    }
}
