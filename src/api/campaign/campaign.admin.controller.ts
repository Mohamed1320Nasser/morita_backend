import { Authorized, Body, Get, JsonController, Param, Post, Put } from "routing-controllers";
import { Service } from "typedi";
import API from "../../common/config/api.types";
import CampaignService, { CampaignInput } from "./campaign.service";

@Service()
@JsonController("/admin/campaigns")
export default class CampaignAdminController {
    constructor(private campaignService: CampaignService) {}

    /** Campaigns with their funnel, cost per signup / customer and ROI */
    @Get("/")
    @Authorized(API.Role.admin)
    async list() {
        return this.campaignService.list();
    }

    /** Creates the campaign and its Discord invite link */
    @Post("/")
    @Authorized(API.Role.admin)
    async create(@Body() data: CampaignInput) {
        return this.campaignService.create(data);
    }

    @Put("/:id")
    @Authorized(API.Role.admin)
    async update(@Param("id") id: string, @Body() data: Partial<CampaignInput>) {
        return this.campaignService.update(id, data);
    }
}
