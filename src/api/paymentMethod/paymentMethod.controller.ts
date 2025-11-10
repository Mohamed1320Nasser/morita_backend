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
import PaymentMethodService from "./paymentMethod.service";
import {
    CreatePaymentMethodDto,
    UpdatePaymentMethodDto,
    GetPaymentMethodListDto,
} from "./dtos";
import { convertResponse } from "../../common/helpers/res.helper";

@JsonController("/api/admin/pricing/payment-methods")
@Service()
export default class PaymentMethodController {
    constructor(private paymentMethodService: PaymentMethodService) {}

    @Post("/")
    async createPaymentMethod(@Body() data: CreatePaymentMethodDto) {
        const method = await this.paymentMethodService.create(data);
        return convertResponse(CreatePaymentMethodDto, method);
    }

    @Get("/")
    async getPaymentMethods(@QueryParams() query: GetPaymentMethodListDto) {
        const result = await this.paymentMethodService.getList(query);
        return result;
    }

    @Get("/:id")
    async getPaymentMethod(@Param("id") id: string) {
        const method = await this.paymentMethodService.getSingle(id);
        return convertResponse(UpdatePaymentMethodDto, method);
    }

    @Patch("/:id")
    async updatePaymentMethod(
        @Param("id") id: string,
        @Body() data: UpdatePaymentMethodDto
    ) {
        const method = await this.paymentMethodService.update(id, data);
        return convertResponse(UpdatePaymentMethodDto, method);
    }

    @Delete("/:id")
    async deletePaymentMethod(@Param("id") id: string) {
        const result = await this.paymentMethodService.delete(id);
        return result;
    }
}

// Public API for Discord bot
@JsonController("/api/public/payment-methods")
@Service()
export class PublicPaymentMethodController {
    constructor(private paymentMethodService: PaymentMethodService) {}

    @Get("/")
    async getPublicPaymentMethods() {
        const methods = await this.paymentMethodService.getPublicList();
        return {
            success: true,
            data: methods,
        };
    }
}
