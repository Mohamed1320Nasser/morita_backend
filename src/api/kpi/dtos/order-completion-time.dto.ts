import { IsEnum, IsOptional, IsDateString } from "class-validator";
import { TimePeriod } from "./common.dto";

export class OrderCompletionTimeQueryDto {
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

export interface OrderCompletionTimeSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalCompletedOrders: number;
    averageCompletionMinutes: number;
    medianCompletionMinutes: number;
    fastestCompletionMinutes: number;
    slowestCompletionMinutes: number;
}

export interface CompletionTimeDistribution {
    under1hour: { count: number; percentage: number };
    hour1to6: { count: number; percentage: number };
    hour6to24: { count: number; percentage: number };
    day1to3: { count: number; percentage: number };
    day3to7: { count: number; percentage: number };
    over7days: { count: number; percentage: number };
}

export interface CompletionTimeByService {
    serviceId: string;
    serviceName: string;
    orderCount: number;
    avgCompletionMinutes: number;
    medianCompletionMinutes: number;
}

export interface CompletionTimeByWorker {
    workerId: number;
    workerName: string;
    completedOrders: number;
    avgCompletionMinutes: number;
}

export interface FastestCompletion {
    orderId: string;
    orderNumber: number;
    serviceName: string;
    workerName: string;
    completionMinutes: number;
    completedAt: Date;
}

export interface SlowestCompletion {
    orderId: string;
    orderNumber: number;
    serviceName: string;
    workerName: string;
    completionMinutes: number;
    completedAt: Date;
}

export interface OrderCompletionTimeResponse {
    summary: OrderCompletionTimeSummary;
    distribution: CompletionTimeDistribution;
    completionByService: CompletionTimeByService[];
    completionByWorker: CompletionTimeByWorker[];
    fastestCompletions: FastestCompletion[];
    slowestCompletions: SlowestCompletion[];
}
