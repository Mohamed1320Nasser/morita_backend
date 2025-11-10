import { JsonController, Get } from "routing-controllers";
import { Service } from "typedi";
import DashboardService from "./dashboard.service";

@JsonController("/dashboard")
@Service()
export default class DashboardController {
    constructor(private dashboardService: DashboardService) {}

    @Get("/stats")
    public async stats() {
        return await this.dashboardService.getStats();
    }

    @Get("/top-services")
    public async topServices() {
        return await this.dashboardService.getTopServices(5);
    }
}
