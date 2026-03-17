import { IsEnum, IsOptional, IsDateString, IsString } from "class-validator";
import { TimePeriod } from "./common.dto";

export class OrderIssuesQueryDto {
    @IsEnum(TimePeriod)
    @IsOptional()
    period?: TimePeriod = TimePeriod.MONTHLY;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsOptional()
    @IsString()
    status?: string;

    @IsOptional()
    @IsString()
    priority?: string;
}

export interface OrderIssuesSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalIssues: number;
    openIssues: number;
    resolvedIssues: number;
    averageResolutionMinutes: number;
    medianResolutionMinutes: number;
    issueRate: number;
}

export interface IssueStatusDistribution {
    status: string;
    count: number;
    percentage: number;
}

export interface IssuePriorityDistribution {
    priority: string;
    count: number;
    percentage: number;
}

export interface IssuesByService {
    serviceId: string;
    serviceName: string;
    issueCount: number;
    issueRate: number;
}

export interface IssueResolutionPerformance {
    resolverName: string;
    resolvedCount: number;
    avgResolutionMinutes: number;
}

export interface UnresolvedIssue {
    issueId: string;
    orderId: string;
    priority: string;
    issueDescription: string;
    reportedBy: string;
    createdAt: Date;
    ageInDays: number;
}

export interface OrderIssuesResponse {
    summary: OrderIssuesSummary;
    statusDistribution: IssueStatusDistribution[];
    priorityDistribution: IssuePriorityDistribution[];
    issuesByService: IssuesByService[];
    resolutionPerformance: IssueResolutionPerformance[];
    unresolvedIssues: UnresolvedIssue[];
}
