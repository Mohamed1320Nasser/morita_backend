import {
    JsonController,
    Get,
    Post,
    Body,
    QueryParams,
    HttpCode,
    Authorized
} from "routing-controllers";
import { Service } from "typedi";
import KpiService from "./kpi.service";
import { RecordMemberActivityDto, MemberGrowthQueryDto, RepeatCustomerQueryDto, SupportResponseQueryDto, TicketConversionQueryDto, PeakTimesQueryDto, SupportReplySpeedQueryDto, OrderIssuesQueryDto, OrderCompletionTimeQueryDto, ServiceRequestQueryDto } from "./dtos";
import API from "../../common/config/api.types";

@JsonController("/kpi")
@Service()
export default class KpiController {
    constructor(private kpiService: KpiService) {}
    @Post("/member-activity")
    @HttpCode(201)
    async recordMemberActivity(@Body() dto: RecordMemberActivityDto) {
        return this.kpiService.recordMemberActivity(dto);
    }

    @Get("/member-growth")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getMemberGrowth(@QueryParams() query: MemberGrowthQueryDto) {
        const startDate = query.startDate ? new Date(query.startDate) : undefined;
        const endDate = query.endDate ? new Date(query.endDate) : undefined;

        return this.kpiService.getMemberGrowth(
            query.period || 'monthly',
            startDate,
            endDate
        );
    }

    @Get("/member-retention")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getMemberRetention(@QueryParams() query: { cohortDate: string }) {
        const cohortDate = new Date(query.cohortDate);
        return this.kpiService.getMemberRetention(cohortDate);
    }

    @Get("/repeat-customers")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getRepeatCustomers(@QueryParams() query: RepeatCustomerQueryDto) {
        return this.kpiService.getRepeatCustomerRate(query);
    }

    @Get("/support-response-time")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getSupportResponseTime(@QueryParams() query: SupportResponseQueryDto) {
        return this.kpiService.getSupportResponseTime(query);
    }

    @Get("/ticket-to-order-conversion")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getTicketToOrderConversion(@QueryParams() query: TicketConversionQueryDto) {
        return this.kpiService.getTicketToOrderConversion(query);
    }

    @Get("/peak-ticket-times")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getPeakTicketTimes(@QueryParams() query: PeakTimesQueryDto) {
        return this.kpiService.getPeakTicketTimes(query);
    }

    @Get("/support-reply-speed")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getSupportReplySpeed(@QueryParams() query: SupportReplySpeedQueryDto) {
        return this.kpiService.getSupportReplySpeed(query);
    }

    @Get("/order-issues")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getOrderIssues(@QueryParams() query: OrderIssuesQueryDto) {
        return this.kpiService.getOrderIssues(query);
    }

    // @Get("/order-completion-time")
    // @Authorized(API.Role.system)
    // @HttpCode(200)
    // async getOrderCompletionTime(@QueryParams() query: OrderCompletionTimeQueryDto) {
    //     return this.kpiService.getOrderCompletionTime(query);
    // }

    @Get("/service-requests")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getServiceRequests(@QueryParams() query: ServiceRequestQueryDto) {
        return this.kpiService.getServiceRequestMetrics(query);
    }

    @Get("/service-request-conversion")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getServiceRequestConversion(@QueryParams() query: any) {
        return this.kpiService.getServiceRequestConversion(query);
    }

    @Get("/worker-performance")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getWorkerPerformance(@QueryParams() query: any) {
        return this.kpiService.getWorkerPerformance(query);
    }

    @Get("/worker-issues")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getWorkerIssues(@QueryParams() query: any) {
        return this.kpiService.getWorkerIssueTracking(query);
    }

    @Get("/order-completion-time")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getOrderCompletionTime(@QueryParams() query: any) {
        return this.kpiService.getOrderCompletionTime(query);
    }

    @Get("/financial-overview")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getFinancialOverview(@QueryParams() query: any) {
        return this.kpiService.getFinancialOverview(query);
    }

    @Get("/discord-engagement")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getDiscordEngagement(@QueryParams() query: any) {
        return this.kpiService.getDiscordEngagement(query);
    }

    @Get("/top-engaged-users")
    @Authorized(API.Role.system)
    @HttpCode(200)
    async getTopEngagedUsers(@QueryParams() query: any) {
        return this.kpiService.getTopEngagedUsers(query);
    }

    @Post("/engagement-rank")
    @Authorized([API.Role.admin])
    @HttpCode(201)
    async awardEngagementRank(@Body() dto: any) {
        return this.kpiService.awardEngagementRank(dto);
    }
}
