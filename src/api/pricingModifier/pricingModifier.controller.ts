import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    QueryParams,
} from "routing-controllers";
import { Service } from "typedi";
import PricingModifierService from "./pricingModifier.service";
import {
    CreatePricingModifierDto,
    UpdatePricingModifierDto,
    GetPricingModifierListDto,
} from "./dtos";
import { convertResponse } from "../../common/helpers/res.helper";

@JsonController("/api/admin/pricing/modifiers")
@Service()
export default class PricingModifierController {
    constructor(private pricingModifierService: PricingModifierService) {}

    @Post("/")
    async createModifier(@Body() data: CreatePricingModifierDto) {
        const modifier = await this.pricingModifierService.create(data);
        return convertResponse(CreatePricingModifierDto, modifier);
    }

    @Get("/")
    async getModifiers(@QueryParams() query: GetPricingModifierListDto) {
        const result = await this.pricingModifierService.getList(query);
        return result;
    }

    @Get("/:id")
    async getModifier(@Param("id") id: string) {
        const modifier = await this.pricingModifierService.getSingle(id);
        return convertResponse(UpdatePricingModifierDto, modifier);
    }

    @Patch("/:id")
    async updateModifier(
        @Param("id") id: string,
        @Body() data: UpdatePricingModifierDto
    ) {
        const modifier = await this.pricingModifierService.update(id, data);
        return convertResponse(UpdatePricingModifierDto, modifier);
    }

    @Delete("/:id")
    async deleteModifier(@Param("id") id: string) {
        const result = await this.pricingModifierService.delete(id);
        return result;
    }
}

// Public API for Discord bot
@JsonController("/api/public/pricing/modifiers")
@Service()
export class PublicPricingModifierController {
    constructor(private pricingModifierService: PricingModifierService) {}

    @Get("/method/:methodId")
    async getModifiersByMethod(@Param("methodId") methodId: string) {
        const modifiers =
            await this.pricingModifierService.getByMethod(methodId);
        return {
            success: true,
            data: modifiers,
        };
    }
}
