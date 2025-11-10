import { JsonController, Post, Get, Param, Body } from "routing-controllers";
import { Service } from "typedi";
import PricingCalculatorService, {
    PriceCalculationRequest,
} from "./pricingCalculator.service";
import {
    IsString,
    IsOptional,
    IsNumber,
    IsObject,
    IsUUID,
    Min,
    Max,
} from "class-validator";

class CalculatePriceDto {
    @IsString()
    @IsUUID()
    methodId: string;

    @IsString()
    @IsUUID()
    paymentMethodId: string;

    @IsOptional()
    @IsNumber()
    quantity?: number = 1;

    @IsOptional()
    @IsObject()
    customConditions?: Record<string, any> = {};
}

class CalculateLevelRangeDto {
    @IsString()
    @IsUUID()
    serviceId: string;

    @IsNumber()
    @Min(1)
    @Max(99)
    startLevel: number;

    @IsNumber()
    @Min(1)
    @Max(99)
    endLevel: number;
}

@JsonController("/api/public/pricing")
@Service()
export default class PricingCalculatorController {
    constructor(private pricingCalculatorService: PricingCalculatorService) {}

    @Post("/calculate")
    async calculatePrice(@Body() data: CalculatePriceDto) {
        const result = await this.pricingCalculatorService.calculatePrice(data);
        return {
            success: true,
            data: result,
        };
    }

    @Get("/service/:serviceId")
    async getServicePricing(@Param("serviceId") serviceId: string) {
        const service =
            await this.pricingCalculatorService.getServicePricing(serviceId);
        return {
            success: true,
            data: service,
        };
    }

    @Post("/calculate-level-range")
    async calculateLevelRange(@Body() data: CalculateLevelRangeDto) {
        console.log('[PricingCalculator] Request received:', JSON.stringify(data));

        const result =
            await this.pricingCalculatorService.calculateLevelRangePrice(data);

        console.log('[PricingCalculator] Service returned result:', {
            hasService: !!result.service,
            serviceName: result.service?.name,
            serviceEmoji: result.service?.emoji,
            hasLevels: !!result.levels,
            hasPriceBreakdown: !!result.priceBreakdown,
            breakdownLength: result.priceBreakdown?.length
        });

        const response = {
            success: true,
            data: result,
        };

        console.log('[PricingCalculator] Sending response:', {
            success: response.success,
            hasData: !!response.data,
            dataKeys: Object.keys(response.data || {})
        });

        return response;
    }
}
