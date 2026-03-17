import { IsEnum, IsOptional, IsDateString, IsNumber, Min, IsBoolean } from "class-validator";
import { Type } from "class-transformer";
import { TimePeriod } from "./common.dto";

export class RepeatCustomerQueryDto {
    @IsEnum(TimePeriod)
    @IsOptional()
    period?: TimePeriod = TimePeriod.ALL;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    minOrderValue?: number;

    @IsOptional()
    @IsBoolean()
    includeAllStatuses?: boolean = false; // Default: completed orders only
}

export interface RepeatCustomerSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalCustomers: number;
    oneTimeCustomers: number;
    repeatCustomers: number;
    repeatCustomerRate: number;
    averageOrdersPerCustomer: number;
    averageCustomerLifetimeValue: number;
    totalRevenue: number;
    repeatCustomerRevenue: number;
    repeatCustomerRevenuePercentage: number;
}

export interface OrderDistribution {
    oneOrder: { count: number; percentage: number };
    twoOrders: { count: number; percentage: number };
    threeToFive: { count: number; percentage: number };
    sixToTen: { count: number; percentage: number };
    elevenPlus: { count: number; percentage: number };
}

export interface TopCustomer {
    userId: number;
    username: string;
    discordUsername: string | null;
    orderCount: number;
    totalSpent: number;
    averageOrderValue: number;
    firstOrderDate: Date;
    lastOrderDate: Date;
    daysSinceLastOrder: number;
    loyaltyTier: string | null;
}

export interface CohortAnalysis {
    cohortMonth: string;
    customersAcquired: number;
    repeatCustomers: number;
    retentionRate: number;
}

export interface TimeAnalysis {
    averageDaysBetweenOrders: number;
    medianDaysBetweenOrders: number;
    repeatPurchaseVelocity: string;
}

export interface RepeatCustomerResponse {
    summary: RepeatCustomerSummary;
    distribution: OrderDistribution;
    topCustomers: TopCustomer[];
    cohortAnalysis: CohortAnalysis[];
    timeAnalysis: TimeAnalysis;
}
