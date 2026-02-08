import { JsonController, Get, Patch, Body } from "routing-controllers";
import { Service } from "typedi";
import { GoldRatesService } from "./gold-rates.service";

@Service()
@JsonController("/gold-rates")
export default class GoldRatesController {
    constructor(private goldRatesService: GoldRatesService) {}

    /**
     * GET /api/gold-rates
     * Get current gold rates
     */
    @Get("/")
    async getRates() {
        return this.goldRatesService.getRates();
    }

    /**
     * PATCH /api/gold-rates
     * Update gold rates
     */
    @Patch("/")
    async updateRates(
        @Body()
        body: {
            buyRate?: number;
            sellRate?: number;
            channelId?: string;
            messageId?: string;
        }
    ) {
        const { buyRate, sellRate, channelId, messageId } = body;

        if (buyRate !== undefined && (isNaN(buyRate) || buyRate < 0)) {
            throw new Error("Invalid buy rate");
        }

        if (sellRate !== undefined && (isNaN(sellRate) || sellRate < 0)) {
            throw new Error("Invalid sell rate");
        }

        return this.goldRatesService.updateRates({
            buyRate,
            sellRate,
            channelId,
            messageId,
        });
    }

    /**
     * GET /api/gold-rates/all-methods
     * Get all payment methods with calculated rates
     */
    @Get("/all-methods")
    async getAllPaymentMethodsWithRates() {
        return this.goldRatesService.getAllPaymentMethodsWithRates();
    }
}
