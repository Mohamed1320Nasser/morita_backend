import {
    JsonController,
    Post,
    Body,
    UseBefore,
    Authorized,
} from "routing-controllers";
import { Service } from "typedi";
import { BatchService } from "./batch.service";
import { BatchCreateServicesDto } from "./dtos/batchCreateServices.dto";
import { BatchCreatePricingMethodsDto } from "./dtos/batchCreatePricingMethods.dto";
import { BatchCreateServicesWithPricingDto } from "./dtos/batchCreateServicesWithPricing.dto";
import API from "../../common/config/api.types";

@JsonController("/batch")
@Service()
export default class BatchController {
    constructor(private batchService: BatchService) {}
    @Post("/services")
    @Authorized(API.Role.system)
    async batchCreateServices(@Body() data: BatchCreateServicesDto) {
        return await this.batchService.batchCreateServices(data);
    }

    @Post("/services/validate")
    @Authorized(API.Role.system)
    async validateBatchServices(@Body() data: BatchCreateServicesDto) {
        return await this.batchService.validateBatchServices(data);
    }

    @Post("/pricing-methods")
    @Authorized(API.Role.system)
    async batchCreatePricingMethods(@Body() data: BatchCreatePricingMethodsDto) {
        return await this.batchService.batchCreatePricingMethods(data);
    }

    @Post("/pricing-methods/validate")
    @Authorized(API.Role.system)
    async validateBatchPricingMethods(@Body() data: BatchCreatePricingMethodsDto) {
        return await this.batchService.validateBatchPricingMethods(data);
    }

    @Post("/services-with-pricing")
    @Authorized(API.Role.system)
    async batchCreateServicesWithPricing(@Body() data: BatchCreateServicesWithPricingDto) {
        return await this.batchService.batchCreateServicesWithPricing(data);
    }

    @Post("/services-with-pricing/validate")
    @Authorized(API.Role.system)
    async validateBatchServicesWithPricing(@Body() data: BatchCreateServicesWithPricingDto) {
        return await this.batchService.validateBatchServicesWithPricing(data);
    }
}
