import { IsEnum, IsOptional, IsDateString, IsString } from "class-validator";
import { TimePeriod } from "./common.dto";

export class SupportReplySpeedQueryDto {
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

export interface SupportReplySpeedSummary {
    period: string;
    startDate: Date | null;
    endDate: Date | null;
    totalCustomerMessages: number;
    totalSupportReplies: number;
    messagesWithoutReply: number;
    averageReplyMinutes: number;
    medianReplyMinutes: number;
    fastestReplyMinutes: number;
    slowestReplyMinutes: number;
}

export interface ReplySpeedDistribution {
    under5min: { count: number; percentage: number };
    min5to15: { count: number; percentage: number };
    min15to30: { count: number; percentage: number };
    min30to60: { count: number; percentage: number };
    hour1to6: { count: number; percentage: number };
    over6hours: { count: number; percentage: number };
}

export interface ReplySpeedByTicketType {
    ticketType: string;
    avgReplyMinutes: number;
    replyCount: number;
}

export interface ReplySpeedByAgent {
    agentId: string;
    agentName: string;
    avgReplyMinutes: number;
    totalReplies: number;
}

export interface SlowestReply {
    ticketId: string;
    ticketNumber: string;
    customerMessage: string;
    supportReply: string;
    replyTimeMinutes: number;
    agentName: string;
    createdAt: Date;
}

export interface SupportReplySpeedResponse {
    summary: SupportReplySpeedSummary;
    distribution: ReplySpeedDistribution;
    replySpeedByTicketType: ReplySpeedByTicketType[];
    replySpeedByAgent: ReplySpeedByAgent[];
    slowestReplies: SlowestReply[];
}
