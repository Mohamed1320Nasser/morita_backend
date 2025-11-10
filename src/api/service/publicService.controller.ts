import { JsonController, Get, Param, QueryParams } from "routing-controllers";
import { Service } from "typedi";
import ServiceService from "./service.service";

@JsonController("/api/public/services")
@Service()
export default class PublicServiceController {
    constructor(private serviceService: ServiceService) {}

    @Get("/")
    async getPublicServices(@QueryParams() query: { categoryId?: string }) {
        const services = await this.serviceService.getPublicList(
            query.categoryId
        );
        return {
            success: true,
            data: services,
        };
    }

    @Get("/:id/pricing")
    async getServicePricing(@Param("id") id: string) {
        const service = await this.serviceService.getServicePricing(id);
        return {
            success: true,
            data: service,
        };
    }

    @Get("/:id/with-pricing")
    async getServiceWithPricing(@Param("id") id: string) {
        const service = await this.serviceService.getServiceWithPricing(id);
        return {
            success: true,
            data: service,
        };
    }
}
