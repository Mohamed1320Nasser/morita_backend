import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Authorized,
    HttpCode
} from "routing-controllers";
import { Service } from "typedi";
import OnboardingService from "./onboarding.service";
import { CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/onboarding/questions")
@Service()
export default class QuestionController {
    constructor(private onboardingService: OnboardingService) {}

    // Get all active questions (for Discord bot)
    @Get("/active")
    @HttpCode(200)
    async getActiveQuestions() {
        return await this.onboardingService.getActiveQuestions();
    }

    // Get all questions with inactive (Admin only)
    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAllQuestions() {
        return await this.onboardingService.getAllQuestions();
    }

    // Get question by ID (Admin only)
    @Get("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getQuestionById(@Param("id") id: string) {
        return await this.onboardingService.getQuestionById(id);
    }

    // Create question (Admin only)
    @Post("/")
    @Authorized(API.Role.admin)
    @HttpCode(201)
    async createQuestion(@Body() dto: CreateQuestionDto) {
        return await this.onboardingService.createQuestion(dto);
    }

    // Update question (Admin only)
    @Put("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async updateQuestion(@Param("id") id: string, @Body() dto: UpdateQuestionDto) {
        return await this.onboardingService.updateQuestion(id, dto);
    }

    // Delete question (Admin only)
    @Delete("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async deleteQuestion(@Param("id") id: string) {
        return await this.onboardingService.deleteQuestion(id);
    }

    // Reorder questions (Admin only)
    @Post("/reorder")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async reorderQuestions(@Body() dto: ReorderQuestionsDto) {
        return await this.onboardingService.reorderQuestions(dto.questionIds);
    }

    // Get answer statistics per question (Admin only)
    @Get("/stats/answers")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAnswerStats() {
        return await this.onboardingService.getAnswerStatistics();
    }
}
