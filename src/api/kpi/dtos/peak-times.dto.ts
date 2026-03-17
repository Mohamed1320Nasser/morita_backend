import { IsEnum, IsOptional, IsDateString, IsString } from "class-validator";
import { TimePeriod } from "./common.dto";

export class PeakTimesQueryDto {
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
    ticketType?: string;
}

export interface HourlyDistribution {
    hour: number;
    count: number;
    percentage: number;
}

export interface DailyDistribution {
    dayOfWeek: number;
    dayName: string;
    count: number;
    percentage: number;
}

export interface PeakTimesSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalTickets: number;
    peakHour: number;
    peakHourCount: number;
    lowestHour: number;
    lowestHourCount: number;
    peakDay: string;
    peakDayCount: number;
    quietestDay: string;
    quietestDayCount: number;
}

export interface PeakTimesByType {
    ticketType: string;
    peakHour: number;
    peakDay: string;
    count: number;
}

export interface PeakTimesResponse {
    summary: PeakTimesSummary;
    hourlyDistribution: HourlyDistribution[];
    dailyDistribution: DailyDistribution[];
    peakTimesByType: PeakTimesByType[];
}
