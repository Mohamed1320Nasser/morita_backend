import { IsEnum, IsOptional, IsDateString, IsString } from "class-validator";
import { TimePeriod } from "./common.dto";

export class TicketConversionQueryDto {
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

    @IsOptional()
    @IsString()
    serviceId?: string;
}

export interface TicketConversionSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalTickets: number;
    ticketsWithOrders: number;
    ticketsWithoutOrders: number;
    conversionRate: number;
    averageConversionMinutes: number;
    medianConversionMinutes: number;
    fastestConversionMinutes: number;
    slowestConversionMinutes: number;
}

export interface ConversionTimeDistribution {
    under5min: { count: number; percentage: number };
    min5to15: { count: number; percentage: number };
    min15to30: { count: number; percentage: number };
    min30to60: { count: number; percentage: number };
    over1hour: { count: number; percentage: number };
    over1day: { count: number; percentage: number };
}

export interface TicketConversionDetail {
    ticketId: string;
    ticketNumber: number;
    ticketType: string;
    ticketCreatedAt: Date;
    orderId: string;
    orderCreatedAt: Date;
    conversionTimeMinutes: number;
    serviceName: string | null;
}

export interface ConversionByTicketType {
    ticketType: string;
    ticketCount: number;
    conversionRate: number;
    avgConversionMinutes: number;
    medianConversionMinutes: number;
}

export interface ConversionByService {
    serviceId: string;
    serviceName: string;
    orderCount: number;
    avgConversionMinutes: number;
}

export interface UnconvertedTicket {
    ticketId: string;
    ticketNumber: number;
    ticketType: string;
    createdAt: Date;
}

export interface TicketConversionResponse {
    summary: TicketConversionSummary;
    distribution: ConversionTimeDistribution;
    conversionByTicketType: ConversionByTicketType[];
    conversionByService: ConversionByService[];
    fastestConversions: TicketConversionDetail[];
    slowestConversions: TicketConversionDetail[];
    unconvertedTickets: UnconvertedTicket[];
}
