import { JsonController, Get } from "routing-controllers";
import { Service } from "typedi";

@JsonController("/api/test")
@Service()
export default class TestController {
    @Get("/public")
    async publicEndpoint() {
        return {
            success: true,
            message: "This is a public endpoint - no auth required",
            timestamp: new Date().toISOString(),
        };
    }
}
