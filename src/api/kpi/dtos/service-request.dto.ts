import { IsEnum, IsDateString, IsOptional } from "class-validator";
import { TimePeriod } from "./common.dto";

export class ServiceRequestQueryDto {
    @IsEnum(TimePeriod)
    @IsOptional()
    period?: TimePeriod = TimePeriod.MONTHLY;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;
}

export interface ServiceRequestSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalServiceTickets: number;
    ticketsWithService: number;
    convertedTickets: number;
    conversionRate: number;
    avgTimeToConvertMinutes: number;
}

export interface ServicePerformance {
    serviceId: string;
    serviceName: string;
    categoryName: string;
    inquiries: number;
    conversions: number;
    conversionRate: number;
    avgTimeToConvertMinutes: number;
}

export interface CategoryPerformance {
    categoryId: string;
    categoryName: string;
    inquiries: number;
    conversions: number;
    conversionRate: number;
}
