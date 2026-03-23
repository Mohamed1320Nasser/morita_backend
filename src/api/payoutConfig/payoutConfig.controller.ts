import { JsonController, Get, Post, Put, Param, Body, Authorized, CurrentUser } from "routing-controllers";
import { Service } from "typedi";
import PayoutConfigService from "./payoutConfig.service";
import { CreatePayoutConfigDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/payout-config")
@Service()
export default class PayoutConfigController {
    constructor(private payoutConfigService: PayoutConfigService) {}

    @Get("/")
    @Authorized(API.Role.system)
    async getActive() {
        return await this.payoutConfigService.getActive();
    }

    @Get("/history")
    @Authorized(API.Role.system)
    async getHistory() {
        return await this.payoutConfigService.getAll();
    }

    @Post("/")
    @Authorized(API.Role.system)
    async upsert(@Body() data: CreatePayoutConfigDto, @CurrentUser() user: any) {
        return await this.payoutConfigService.upsert(data, user.id);
    }

    @Put("/:id/toggle-active")
    @Authorized(API.Role.system)
    async toggleActive(@Param("id") id: string) {
        return await this.payoutConfigService.toggleActive(id);
    }
}
