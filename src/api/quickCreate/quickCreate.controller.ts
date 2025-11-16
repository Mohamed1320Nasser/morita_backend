import { JsonController, Post, Body } from "routing-controllers";
import { Service } from "typedi";
import QuickCreateService from "./quickCreate.service";
import { QuickCreateDto } from "./dtos/quickCreate.dto";

@JsonController("/quick-create")
@Service()
export default class QuickCreateController {
    constructor(private quickCreateService: QuickCreateService) {}

    @Post("/")
    async quickCreate(@Body() data: QuickCreateDto) {
        const result = await this.quickCreateService.quickCreate(data);
        return {
            success: true,
            data: result,
        };
    }
}
