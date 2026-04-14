import { JsonController, Get, Authorized } from "routing-controllers";
import { Service } from "typedi";
import DashboardService from "./dashboard.service";
import API from "../../common/config/api.types";
import logger from "../../common/loggers";

@JsonController("/dashboard")
@Service()
export default class DashboardController {
    constructor(private dashboardService: DashboardService) {}

    @Get("/stats")
    @Authorized(API.Role.admin)
    public async stats() {
        logger.info(`[Admin] Fetching comprehensive dashboard statistics`);
        return await this.dashboardService.getAdminDashboardStats();
    }

    @Get("/activity")
    @Authorized(API.Role.admin)
    public async activity() {
        logger.info(`[Admin] Fetching recent activity feed`);
        return await this.dashboardService.getRecentActivity();
    }

    @Get("/health")
    @Authorized(API.Role.admin)
    public async health() {
        logger.info(`[Admin] Fetching system health status`);
        return await this.dashboardService.getSystemHealth();
    }

    @Get("/top-services")
    public async topServices() {
        return await this.dashboardService.getTopServices(5);
    }
}
