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
    Put,
} from "routing-controllers";
import { Service } from "typedi";
import ServiceCategoryService from "./serviceCategory.service";
import {
    CreateServiceCategoryDto,
    UpdateServiceCategoryDto,
    GetServiceCategoryListDto,
} from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/categories")
@Service()
export default class CategoriesController {
    constructor(private serviceCategoryService: ServiceCategoryService) {}

    @Post("/")
    @Authorized(API.Role.system)
    async create(@Body() data: CreateServiceCategoryDto) {
        return await this.serviceCategoryService.create(data);
    }

    @Get("/")
    async list(@QueryParams() query: GetServiceCategoryListDto) {
        return await this.serviceCategoryService.getList(query);
    }

    @Get("/:id")
    async single(@Param("id") id: string) {
        return await this.serviceCategoryService.getSingle(id);
    }

    @Put("/:id")
    @Authorized(API.Role.system)
    async update(
        @Param("id") id: string,
        @Body() data: UpdateServiceCategoryDto
    ) {
        return await this.serviceCategoryService.update(id, data);
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async remove(@Param("id") id: string) {
        return await this.serviceCategoryService.delete(id);
    }
}
