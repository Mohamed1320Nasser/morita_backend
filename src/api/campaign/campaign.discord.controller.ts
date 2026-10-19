import { Body, JsonController, Post, UseBefore } from "routing-controllers";
import { Service } from "typedi";
import {
    DiscordAuthMiddleware,
    DiscordRateLimitMiddleware,
} from "../../common/middlewares/discordAuth.middleware";
import CampaignService from "./campaign.service";

@Service()
@JsonController("/discord/campaigns")
@UseBefore(DiscordAuthMiddleware)
@UseBefore(DiscordRateLimitMiddleware)
export default class CampaignDiscordController {
    constructor(private campaignService: CampaignService) {}

    /** The bot reports which invite a new member used. Body: { inviteCode, discordId } */
    @Post("/track")
    async track(@Body() data: { inviteCode: string; discordId: string }) {
        return this.campaignService.trackJoin(data.inviteCode, data.discordId);
    }
}
