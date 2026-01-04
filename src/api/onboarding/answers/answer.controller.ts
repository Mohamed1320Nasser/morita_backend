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
import AnswerService from "./answer.service";
import { SubmitAnswersDto } from "../dtos";
import API from "../../../common/config/api.types";
import logger from "../../../common/loggers";

@JsonController("/onboarding/answers")
@Service()
export default class AnswerController {
    constructor(private answerService: AnswerService) {}

    @Post("/")
    @HttpCode(201)
    async submitAnswers(@Body() dto: SubmitAnswersDto) {
        return await this.answerService.submitAnswers(dto);
    }

    @Get("/user/:discordId")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getUserAnswers(@Param("discordId") discordId: string) {
        return await this.answerService.getUserAnswers(discordId);
    }

    @Get("/")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async getAllAnswers(
        @QueryParam("page") page: number = 1,
        @QueryParam("limit") limit: number = 50
    ) {
        return await this.answerService.getAllAnswers(page, limit);
    }

    @Get("/export")
    @Authorized(API.Role.admin)
    @HttpCode(200)
    async exportAnswers(@Res() res: Response) {
            const excelBuffer = await this.answerService.exportToExcel();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=onboarding-responses.xlsx');
            return res.send(excelBuffer);
    }
}
