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

    /**
     * Create multiple pricing methods in batch
     * POST /batch/pricing-methods
     *
     * @param data - Batch creation payload
     * @returns Success/failure summary with created pricing methods and errors
     */
    @Post("/pricing-methods")
    @Authorized(API.Role.system)
    async batchCreatePricingMethods(@Body() data: BatchCreatePricingMethodsDto) {
        return await this.batchService.batchCreatePricingMethods(data);
    }

    /**
     * Validate batch pricing methods without creating
     * POST /batch/pricing-methods/validate
     *
     * @param data - Batch creation payload to validate
     * @returns Validation result
     */
    @Post("/pricing-methods/validate")
    @Authorized(API.Role.system)
    async validateBatchPricingMethods(@Body() data: BatchCreatePricingMethodsDto) {
        return await this.batchService.validateBatchPricingMethods(data);
    }
}
