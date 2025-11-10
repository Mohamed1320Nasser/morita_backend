import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    QueryParams,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import PricingMethodService from "./pricingMethod.service";
import {
    CreatePricingMethodDto,
    UpdatePricingMethodDto,
    GetPricingMethodListDto,
} from "./dtos";
import { convertResponse } from "../../common/helpers/res.helper";
import API from "../../common/config/api.types";

@JsonController("/pricing/methods")
@Service()
export default class PricingMethodController {
    constructor(private pricingMethodService: PricingMethodService) {}

    @Post("/")
    @Authorized(API.Role.system)
    async createMethod(@Body() data: CreatePricingMethodDto) {
        const method = await this.pricingMethodService.create(data);
        return convertResponse(CreatePricingMethodDto, method);
    }

    @Get("/")
    async getMethods(@QueryParams() query: GetPricingMethodListDto) {
        const result = await this.pricingMethodService.getList(query);
        return result;
    }

    @Get("/:id")
    async getMethod(@Param("id") id: string) {
        return await this.pricingMethodService.getSingle(id);
    }

    @Patch("/:id")
    @Authorized(API.Role.system)
    async updateMethod(
        @Param("id") id: string,
        @Body() data: UpdatePricingMethodDto
    ) {
        const method = await this.pricingMethodService.update(id, data);
        return convertResponse(UpdatePricingMethodDto, method);
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async deleteMethod(@Param("id") id: string) {
        const result = await this.pricingMethodService.delete(id);
        return result;
    }
}
