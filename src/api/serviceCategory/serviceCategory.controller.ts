import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    QueryParams,
    UseBefore,
    Req,
} from "routing-controllers";
import { Service } from "typedi";
import ServiceCategoryService from "./serviceCategory.service";
import {
    CreateServiceCategoryDto,
    UpdateServiceCategoryDto,
    GetServiceCategoryListDto,
} from "./dtos";
import { Request } from "express";
import { convertResponse } from "../../common/helpers/res.helper";

@JsonController("/categories")
@Service()
export default class ServiceCategoryController {
    constructor(private serviceCategoryService: ServiceCategoryService) {}

    @Post("/")
    async createCategory(@Body() data: CreateServiceCategoryDto) {
        const category = await this.serviceCategoryService.create(data);
        return convertResponse(CreateServiceCategoryDto, category);
    }

    @Get("/")
    async getCategories(@QueryParams() query: GetServiceCategoryListDto) {
        const result = await this.serviceCategoryService.getList(query);
        return result;
    }

    @Get("/:id")
    async getCategory(@Param("id") id: string) {
        const category = await this.serviceCategoryService.getSingle(id);
        return convertResponse(UpdateServiceCategoryDto, category);
    }

    @Patch("/:id")
    async updateCategory(
        @Param("id") id: string,
        @Body() data: UpdateServiceCategoryDto
    ) {
        const category = await this.serviceCategoryService.update(id, data);
        return convertResponse(UpdateServiceCategoryDto, category);
    }

    @Delete("/:id")
    async deleteCategory(@Param("id") id: string) {
        const result = await this.serviceCategoryService.delete(id);
        return result;
    }
}

// Public API for Discord bot
@JsonController("/api/public/service-categories")
@Service()
export class PublicServiceCategoryController {
    constructor(private serviceCategoryService: ServiceCategoryService) {}

    @Get("/")
    async getPublicCategories() {
        const categories = await this.serviceCategoryService.getPublicList();
        return {
            success: true,
            data: categories,
        };
    }
}
