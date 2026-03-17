import { IsString, IsEnum, IsOptional, IsDateString } from "class-validator";

export enum MemberEventType {
    JOIN = "JOIN",
    LEAVE = "LEAVE",
    KICK = "KICK",
    BAN = "BAN"
}

export class RecordMemberActivityDto {
    @IsString()
    discordId: string;

    @IsString()
    username: string;

    @IsString()
    @IsOptional()
    displayName?: string;

    @IsEnum(MemberEventType)
    eventType: MemberEventType;

    @IsString()
    @IsOptional()
    reason?: string;

    @IsDateString()
    @IsOptional()
    timestamp?: string;
}

export class MemberGrowthQueryDto {
    @IsEnum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    @IsOptional()
    period?: string = 'monthly';

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;
}
