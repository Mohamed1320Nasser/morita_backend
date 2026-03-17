import {
    JsonController,
    Get,
    Post,
    Delete,
    Body,
    Param,
    QueryParams,
    HttpCode,
    Authorized,
    CurrentUser
} from "routing-controllers";
import { Service } from "typedi";
import ExpenseService from "./expense.service";
import { CreateExpenseDto } from "../kpi/dtos";
import API from "../../common/config/api.types";

@JsonController("/expenses")
@Service()
export default class ExpenseController {
    constructor(private expenseService: ExpenseService) {}

    @Post("/")
    @Authorized([API.Role.admin, API.Role.system])
    @HttpCode(201)
    async createExpense(
        @Body() dto: CreateExpenseDto,
        @CurrentUser() user: any
    ) {
        return this.expenseService.createExpense({
            ...dto,
            createdBy: user.id
        });
    }

    @Get("/")
    @Authorized([API.Role.admin, API.Role.system])
    @HttpCode(200)
    async getExpenses(@QueryParams() query: any) {
        return this.expenseService.getExpenses(query);
    }

    @Delete("/:id")
    @Authorized([API.Role.admin])
    @HttpCode(200)
    async deleteExpense(@Param("id") id: string) {
        return this.expenseService.deleteExpense(id);
    }
}
