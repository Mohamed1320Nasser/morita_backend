import { IsEnum, IsOptional, IsDateString, IsNumber, Min } from "class-validator";
import { Type } from "class-transformer";
import { TimePeriod } from "./common.dto";

export class SupportResponseQueryDto {
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
    ticketType?: string; // Filter by ticket type

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    supportUserId?: number; // Filter by specific support agent

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(1)
    slaTargetMinutes?: number = 15; // Default SLA target: 15 minutes
}

export interface SupportResponseSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalTickets: number;
    ticketsWithResponse: number;
    ticketsWithoutResponse: number;
    averageResponseTimeMinutes: number;
    medianResponseTimeMinutes: number;
    slaTargetMinutes: number;
    slaComplianceRate: number; // % within SLA
    fastestResponseMinutes: number;
    slowestResponseMinutes: number;
}

export interface ResponseTimeDistribution {
    under5min: { count: number; percentage: number };
    min5to15: { count: number; percentage: number };
    min15to30: { count: number; percentage: number };
    min30to60: { count: number; percentage: number };
    over1hour: { count: number; percentage: number };
    over4hours: { count: number; percentage: number };
}

export interface TicketResponseDetail {
    ticketId: string;
    ticketNumber: number;
    ticketType: string;
    ticketCreatedAt: Date;
    firstResponseAt: Date | null;
    responseTimeMinutes: number | null;
    respondedBySupportId: number | null;
    respondedBySupportName: string | null;
    withinSLA: boolean;
}

export interface SupportAgentPerformance {
    supportUserId: number;
    supportName: string;
    discordUsername: string | null;
    ticketsResponded: number;
    averageResponseTimeMinutes: number;
    medianResponseTimeMinutes: number;
    slaComplianceRate: number;
    fastestResponseMinutes: number;
    slowestResponseMinutes: number;
}

export interface ResponseTimeByTicketType {
    ticketType: string;
    ticketCount: number;
    averageResponseTimeMinutes: number;
    medianResponseTimeMinutes: number;
    slaComplianceRate: number;
}

export interface ResponseTimeByDay {
    dayOfWeek: string; // Monday, Tuesday, etc.
    ticketCount: number;
    averageResponseTimeMinutes: number;
}

export interface SupportResponseResponse {
    summary: SupportResponseSummary;
    distribution: ResponseTimeDistribution;
    ticketsWithoutResponse: TicketResponseDetail[];
    slowestResponses: TicketResponseDetail[];
    supportAgentPerformance: SupportAgentPerformance[];
    responseByTicketType: ResponseTimeByTicketType[];
    responseByDay: ResponseTimeByDay[];
}
