import {
    JsonController,
    Get,
    Post,
    Body,
    Param,
    QueryParam,
    Authorized,
    HttpCode,
    Res
} from "routing-controllers";
import { Service } from "typedi";
import { Response } from "express";
import OnboardingService from "./onboarding.service";
import { SubmitAnswersDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/onboarding/answers")
@Service()
export default class AnswerController {
    constructor(private onboardingService: OnboardingService) {}

    // Submit answers (called by Discord bot)
    @Post("/")
    @HttpCode(201)
    async submitAnswers(@Body() dto: SubmitAnswersDto) {
        return await this.onboardingService.submitAnswers(dto);
    }

    // Get user's answers by Discord ID (Admin only)
    @Get("/user/:discordId")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getUserAnswers(@Param("discordId") discordId: string) {
        return await this.onboardingService.getUserAnswers(discordId);
    }

    // Get all answers with pagination (Admin only)
    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAllAnswers(
        @QueryParam("page") page: number = 1,
        @QueryParam("limit") limit: number = 50
    ) {
        return await this.onboardingService.getAllAnswers(page, limit);
    }

    // Export answers to Excel (Admin only)
    @Get("/export")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async exportAnswers(@Res() res: Response) {
        const excelBuffer = await this.onboardingService.exportToExcel();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=onboarding-responses.xlsx');

        return res.send(excelBuffer);
    }
}
