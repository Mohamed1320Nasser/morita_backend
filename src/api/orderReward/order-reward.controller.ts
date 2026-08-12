import {
    JsonController,
    Get,
    Post,
    Put,
    QueryParams,
    Body,
    Authorized,
    UseBefore,
    Param,
} from "routing-controllers";
import { Service } from "typedi";
import OrderRewardService from "./order-reward.service";
import {
    UpdateOrderRewardConfigDto,
    GetAllOrderRewardClaimsDto,
    GrantManualRewardDto,
} from "./dtos";
import { DiscordAuthMiddleware } from "../../common/middlewares/discordAuth.middleware";
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

    @Post("/grant")
    @UseBefore(DiscordAuthMiddleware)
    async grantManualReward(@Body() data: GrantManualRewardDto) {
        return this.orderRewardService.grantManualRewardByDiscordId(data);
    }

    @Get("/public-config")
    @UseBefore(DiscordAuthMiddleware)
    async getPublicConfig() {
        return this.orderRewardService.getPublicConfig();
    }

    @Get("/order/:orderId")
    @UseBefore(DiscordAuthMiddleware)
    async getRewardByOrderId(@Param("orderId") orderId: string) {
        return this.orderRewardService.getRewardByOrderId(orderId);
    }
}
