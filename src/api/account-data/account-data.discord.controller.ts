import {
    JsonController,
    Get,
    Post,
    Delete,
    Body,
    Param,
    QueryParam,
} from "routing-controllers";
import { Service } from "typedi";
import { accountDataService } from "./account-data.service";

@JsonController("/account-data")
@Service()
export default class AccountDataDiscordController {
    @Get("/types")
    async getAccountTypes() {
        return accountDataService.getAccountTypes();
    }

    @Get("/types/:slug")
    async getAccountType(@Param("slug") slug: string) {
        return accountDataService.getAccountType(slug);
    }

    @Post("/types/init")
    async initDefaultTypes() {
        return accountDataService.initDefaultTypes();
    }

    @Post("/types")
    async addAccountType(@Body() body: { name: string }) {
        return accountDataService.addAccountType(body.name);
    }

    @Post("/types/:slug/questions")
    async addQuestion(
        @Param("slug") slug: string,
        @Body() body: { fieldName: string; label: string; isRequired?: boolean; placeholder?: string }
    ) {
        return accountDataService.addQuestion(
            slug,
            body.fieldName,
            body.label,
            body.isRequired ?? true,
            body.placeholder
        );
    }

    @Delete("/types/:slug")
    async deleteAccountType(@Param("slug") slug: string) {
        return accountDataService.deleteAccountType(slug);
    }

    @Get("/order/:orderId")
    async getOrderAccountData(@Param("orderId") orderId: string) {
        return accountDataService.getOrderAccountData(orderId);
    }

    @Get("/order/:orderId/can-submit")
    async canSubmitAccountData(
        @Param("orderId") orderId: string,
        @QueryParam("discordId") discordId: string
    ) {
        return accountDataService.canSubmitAccountData(orderId, discordId);
    }

    @Get("/order/:orderId/can-view")
    async canViewAccountData(
        @Param("orderId") orderId: string,
        @QueryParam("discordId") discordId: string
    ) {
        return accountDataService.canViewAccountData(orderId, discordId);
    }

    @Post("/order/:orderId/submit")
    async submitAccountData(
        @Param("orderId") orderId: string,
        @Body() body: { accountType: string; data: Record<string, string>; submittedBy: string }
    ) {
        return accountDataService.submitAccountData(
            orderId,
            body.accountType,
            body.data,
            body.submittedBy
        );
    }

    @Post("/order/:orderId/view")
    async viewAccountData(
        @Param("orderId") orderId: string,
        @Body() body: { viewerDiscordId: string }
    ) {
        return accountDataService.viewAccountData(orderId, body.viewerDiscordId);
    }

    @Get("/types/list/all")
    async getAllAccountTypesWithQuestions() {
        return accountDataService.getAllAccountTypesWithQuestions();
    }
}
