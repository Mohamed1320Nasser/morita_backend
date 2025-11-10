import { JsonController, Get } from "routing-controllers";
import { Service } from "typedi";
import ServiceCategoryService from "./serviceCategory.service";

@JsonController("/api/public/service-categories")
@Service()
export default class PublicServiceCategoryController {
    constructor(private serviceCategoryService: ServiceCategoryService) {}

    @Get("/")
    async getPublicCategories() {
        const categories = await this.serviceCategoryService.getPublicList();
        return {
            success: true,
            data: categories,
        };
    }

    @Get("/with-services")
    async getPublicCategoriesWithServices() {
        const categories =
            await this.serviceCategoryService.getPublicListWithServices();
        return {
            success: true,
            data: categories,
        };
    }
}
