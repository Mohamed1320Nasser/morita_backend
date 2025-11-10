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
} from "routing-controllers";
import { Service } from "typedi";
import ServiceService from "./service.service";
import { CreateServiceDto, UpdateServiceDto, GetServiceListDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/services")
@Service()
export default class ServicesController {
    constructor(private serviceService: ServiceService) {}

    @Post("/")
    @Authorized(API.Role.system)
    async create(@Body() data: CreateServiceDto) {
        return await this.serviceService.create(data);
    }

    @Get("/")
    async list(@QueryParams() query: GetServiceListDto) {
        return await this.serviceService.getList(query);
    }

    @Get("/:id")
    async single(@Param("id") id: string) {
        return await this.serviceService.getSingle(id);
    }

    @Patch("/:id")
    @Authorized(API.Role.system)
    async update(@Param("id") id: string, @Body() data: UpdateServiceDto) {
        return await this.serviceService.update(id, data);
    }

    @Delete("/:id")
    @Authorized(API.Role.system)
    async remove(@Param("id") id: string) {
        return await this.serviceService.delete(id);
    }
}
