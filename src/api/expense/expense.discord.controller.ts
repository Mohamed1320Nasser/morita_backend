import {
    JsonController,
    Get,
    Post,
    Body,
    QueryParams,
    HttpCode,
    UseBefore,
} from "routing-controllers";
import { Service } from "typedi";
import ExpenseService from "./expense.service";
import prisma from "../../common/prisma/client";
import { NotFoundError } from "routing-controllers";
import { CreateExpenseDto } from "../kpi/dtos";
import {
    DiscordAuthMiddleware,
    DiscordRateLimitMiddleware,
} from "../../common/middlewares/discordAuth.middleware";

@JsonController("/discord/expenses")
@Service()
@UseBefore(DiscordAuthMiddleware)
@UseBefore(DiscordRateLimitMiddleware)
export default class DiscordExpenseController {
    constructor(private expenseService: ExpenseService) {}

    @Post("/")
    @HttpCode(201)
    async createExpense(
        @Body() data: CreateExpenseDto & { createdByDiscordId: string }
    ) {
        const { createdByDiscordId, ...dto } = data;

        const creator = await prisma.user.findUnique({
            where: { discordId: createdByDiscordId },
        });

        if (!creator) {
            throw new NotFoundError("Staff member not found");
        }

        return this.expenseService.createExpense({
            ...dto,
            createdBy: creator.id,
        });
    }

    @Get("/")
    @HttpCode(200)
    async getExpenses(@QueryParams() query: any) {
        return this.expenseService.getExpenses(query);
    }
}
