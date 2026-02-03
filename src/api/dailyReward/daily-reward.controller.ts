import {
    JsonController,
    Get,
    Put,
    Post,
    Body,
    Param,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import DailyRewardService from "./daily-reward.service";
import {
    UpdateConfigDto,
    ClaimRewardDto,
    GetClaimHistoryDto,
    GetLeaderboardDto,
    GetAllClaimsDto,
} from "./dtos";
import API from "../../common/config/api.types";

@Service()
@JsonController("/daily-reward")
export default class DailyRewardController {
    constructor(private dailyRewardService: DailyRewardService) {}

    @Get("/config")
    @Authorized(API.Role.system)
    async getConfig() {
        return this.dailyRewardService.getConfig();
    }

    @Put("/config")
    @Authorized(API.Role.system)
    async updateConfig(@Body() data: UpdateConfigDto) {
        return this.dailyRewardService.updateConfig(data);
    }


    @Get("/public-config")
    async getPublicConfig() {
        return this.dailyRewardService.getPublicConfig();
    }

    @Get("/status/:discordId")
    async getClaimStatus(@Param("discordId") discordId: string) {
        return this.dailyRewardService.getClaimStatus(discordId);
    }

    @Post("/claim")
    async claimReward(@Body() data: ClaimRewardDto) {
        return this.dailyRewardService.claimReward(data.discordId);
    }

    @Get("/history/:discordId")
    async getClaimHistory(
        @Param("discordId") discordId: string,
        @QueryParams() query: GetClaimHistoryDto
    ) {
        return this.dailyRewardService.getClaimHistory(discordId, query.limit);
    }

    @Get("/leaderboard")
    async getLeaderboard(@QueryParams() query: GetLeaderboardDto) {
        return this.dailyRewardService.getLeaderboard(query.limit);
    }

    @Get("/claims")
    @Authorized(API.Role.system)
    async getAllClaims(@QueryParams() query: GetAllClaimsDto) {
        return this.dailyRewardService.getAllClaims(query.page, query.limit, query.search);
    }
}
