import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    MaxLength,
    IsUrl,
    Matches,
    IsObject,
    ValidateNested,
    IsArray,
} from "class-validator";
import { Type, Transform } from "class-transformer";
import { TicketType } from "@prisma/client";

// Custom field definition interface
export interface CustomFieldDefinition {
    id: string;
    label: string;
    type: "text" | "textarea" | "number" | "select" | "checkbox" | "date";
    required: boolean;
    placeholder?: string;
    options?: string[]; // For select type
    min?: number; // For number type
    max?: number; // For number type
    maxLength?: number; // For text/textarea
    description?: string;
    defaultValue?: string | number | boolean;
}

export class CreateTicketTypeSettingsDto {
    @IsEnum(TicketType)
    ticketType: TicketType;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsUrl()
    @MaxLength(2000)
    bannerUrl?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsUrl()
    @MaxLength(2000)
    thumbnailUrl?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @MaxLength(255)
    welcomeTitle?: string;

    @IsString()
    @MaxLength(4000)
    welcomeMessage: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @MaxLength(1000)
    footerText?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @Matches(/^[0-9A-Fa-f]{6}$/, {
        message: "embedColor must be a valid 6-character hex color (without #)",
    })
    embedColor?: string;

    @IsOptional()
    @IsObject()
    customFields?: {
        fields: CustomFieldDefinition[];
    };

    @IsOptional()
    @IsBoolean()
    autoAssign?: boolean = false;

    @IsOptional()
    @IsBoolean()
    notifyOnCreate?: boolean = true;

    @IsOptional()
    @IsBoolean()
    notifyOnClose?: boolean = true;

    @IsOptional()
    @IsBoolean()
    mentionSupport?: boolean = true;

    @IsOptional()
    @IsBoolean()
    mentionCustomer?: boolean = true;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean = true;
}

export class UpdateTicketTypeSettingsDto {
    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsUrl()
    @MaxLength(2000)
    bannerUrl?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsUrl()
    @MaxLength(2000)
    thumbnailUrl?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @MaxLength(255)
    welcomeTitle?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4000)
    welcomeMessage?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @MaxLength(1000)
    footerText?: string;

    @IsOptional()
    @Transform(({ value }) => value === "" ? null : value)
    @IsString()
    @Matches(/^[0-9A-Fa-f]{6}$/, {
        message: "embedColor must be a valid 6-character hex color (without #)",
    })
    embedColor?: string;

    @IsOptional()
    @IsObject()
    customFields?: {
        fields: CustomFieldDefinition[];
    };

    @IsOptional()
    @IsBoolean()
    autoAssign?: boolean;

    @IsOptional()
    @IsBoolean()
    notifyOnCreate?: boolean;

    @IsOptional()
    @IsBoolean()
    notifyOnClose?: boolean;

    @IsOptional()
    @IsBoolean()
    mentionSupport?: boolean;

    @IsOptional()
    @IsBoolean()
    mentionCustomer?: boolean;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class GetTicketTypeSettingsDto {
    @IsEnum(TicketType)
    ticketType: TicketType;
}

export class GetTicketTypeSettingsListDto {
    @IsOptional()
    @IsBoolean()
    activeOnly?: boolean = false;
}
