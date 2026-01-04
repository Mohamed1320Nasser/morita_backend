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
import QuestionService from "./question.service";
import { CreateQuestionDto, UpdateQuestionDto, ReorderQuestionsDto } from "../dtos";
import API from "../../../common/config/api.types";
import logger from "../../../common/loggers";

@JsonController("/onboarding/questions")
@Service()
export default class QuestionController {
    constructor(private questionService: QuestionService) {}

    @Get("/active")
    @HttpCode(200)
    async getActiveQuestions() {
        return await this.questionService.getActiveQuestions();
    }

    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAllQuestions() {
        return await this.questionService.getAllQuestions();
    }

    @Get("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getQuestionById(@Param("id") id: string) {
        return await this.questionService.getQuestionById(id);
    }

    @Post("/")
    @Authorized(API.Role.admin)
    @HttpCode(201)
    async createQuestion(@Body() dto: CreateQuestionDto) {
        return await this.questionService.createQuestion(dto);
    }

    @Put("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async updateQuestion(@Param("id") id: string, @Body() dto: UpdateQuestionDto) {
        return await this.questionService.updateQuestion(id, dto);
    }

    @Delete("/:id")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async deleteQuestion(@Param("id") id: string) {
        return await this.questionService.deleteQuestion(id);
    }

    @Post("/reorder")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async reorderQuestions(@Body() dto: ReorderQuestionsDto) {
        return await this.questionService.reorderQuestions(dto.questionIds);
    }

    @Get("/stats/answers")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAnswerStats() {
        return await this.questionService.getAnswerStatistics();
    }
}
