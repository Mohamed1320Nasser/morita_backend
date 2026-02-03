import {
    JsonController,
    Get,
    Put,
    QueryParams,
    Body,
    Authorized,
    Param,
} from "routing-controllers";
import { Service } from "typedi";
import OrderRewardService from "./order-reward.service";
import { UpdateOrderRewardConfigDto, GetAllOrderRewardClaimsDto } from "./dtos";
import API from "../../common/config/api.types";

@Service()
@JsonController("/order-reward")
export default class OrderRewardController {
    constructor(private orderRewardService: OrderRewardService) {}

    @Get("/config")
    @Authorized(API.Role.system)
    async getConfig() {
        return this.orderRewardService.getConfig();
    }

    @Put("/config")
    @Authorized(API.Role.system)
    async updateConfig(@Body() data: UpdateOrderRewardConfigDto) {
        return this.orderRewardService.updateConfig(data);
    }

    @Get("/claims")
    @Authorized(API.Role.system)
    async getAllClaims(@QueryParams() query: GetAllOrderRewardClaimsDto) {
        return this.orderRewardService.getAllClaims(query.page, query.limit, query.search);
    }

    @Get("/stats")
    @Authorized(API.Role.system)
    async getStats() {
        return this.orderRewardService.getStats();
    }

    @Get("/order/:orderId")
    async getRewardByOrderId(@Param("orderId") orderId: string) {
        return this.orderRewardService.getRewardByOrderId(orderId);
    }
}
