import {
    JsonController,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import PaymentOptionsService from "./payment-options.service";
import {
    CreatePaymentOptionDto,
    UpdatePaymentOptionDto,
    ReorderPaymentOptionsDto,
    UpdatePaymentDiscordConfigDto,
} from "./dtos";
import API from "../../common/config/api.types";

@Service()
@JsonController("/payment-options")
export default class PaymentOptionsController {
    constructor(private paymentOptionsService: PaymentOptionsService) {}

    // ==================== Payment Options ====================

    @Get("/")
    @Authorized(API.Role.system)
    async getAllPaymentOptions() {
        return this.paymentOptionsService.getAllPaymentOptions();
    }

    @Get("/active")
    async getActivePaymentOptions() {
        return this.paymentOptionsService.getActivePaymentOptions();
    }

    @Get("/types")
    async getPaymentTypes() {
        return this.paymentOptionsService.getPaymentTypes();
    }

    // ==================== Discord Config (MUST be before /:id routes) ====================

    @Get("/discord-config")
    // No @Authorized - public endpoint for Discord bot to fetch config
    async getDiscordConfig() {
        return this.paymentOptionsService.getDiscordConfig();
    }

    @Put("/discord-config")
    @Authorized(API.Role.system)
    async updateDiscordConfig(@Body() data: UpdatePaymentDiscordConfigDto) {
        return this.paymentOptionsService.updateDiscordConfig(data);
    }

    @Post("/discord-config/publish")
    @Authorized(API.Role.system)
    async publishToDiscord() {
        return this.paymentOptionsService.publishToDiscord();
    }

    // ==================== Payment Options by ID ====================

    @Get("/:id")
    @Authorized(API.Role.system)
    async getPaymentOptionById(@Param("id") id: string) {
        return this.paymentOptionsService.getPaymentOptionById(id);
    }

    @Post("/")
    @Authorized(API.Role.system)
    async createPaymentOption(@Body() data: CreatePaymentOptionDto) {
        return this.paymentOptionsService.createPaymentOption(data);
    }

    @Put("/reorder")
    @Authorized(API.Role.system)
    async reorderPaymentOptions(@Body() data: ReorderPaymentOptionsDto) {
        return this.paymentOptionsService.reorderPaymentOptions(data.orders);
    }

    @Put("/:id")
    @Authorized(API.Role.system)
    async updatePaymentOption(@Param("id") id: string, @Body() data: UpdatePaymentOptionDto) {
        return this.paymentOptionsService.updatePaymentOption(id, data);
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async deletePaymentOption(@Param("id") id: string) {
        return this.paymentOptionsService.deletePaymentOption(id);
    }
}
