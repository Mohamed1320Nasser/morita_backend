import {
    JsonController,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Body,
    QueryParams,
    Req,
    Put,
} from "routing-controllers";
import { Service } from "typedi";
import ServiceService from "./service.service";
import { CreateServiceDto, UpdateServiceDto, GetServiceListDto } from "./dtos";
import { Request } from "express";
import { convertResponse } from "../../common/helpers/res.helper";

@JsonController("/services")
@Service()
export default class ServiceController {
    constructor(private serviceService: ServiceService) {}

    @Post("/")
    async createService(@Body() data: CreateServiceDto) {
        const service = await this.serviceService.create(data);
        return convertResponse(CreateServiceDto, service);
    }

    @Get("/")
    async getServices(@QueryParams() query: GetServiceListDto) {
        const result = await this.serviceService.getList(query);
        return result;
    }

    @Get("/:id")
    async getService(@Param("id") id: string) {
        const service = await this.serviceService.getSingle(id);
        return service;
    }

    @Put("/:id")
    async updateService(
        @Param("id") id: string,
        @Body() data: UpdateServiceDto
    ) {
        const service = await this.serviceService.update(id, data);
        return convertResponse(UpdateServiceDto, service);
    }

    @Delete("/:id")
    async deleteService(@Param("id") id: string) {
        const result = await this.serviceService.delete(id);
        return result;
    }
}
