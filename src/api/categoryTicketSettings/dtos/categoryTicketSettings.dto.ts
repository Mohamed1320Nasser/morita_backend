import { Transform } from "class-transformer";
import {
    IsString,
    IsOptional,
    IsBoolean,
    MaxLength,
    IsUrl,
    Matches,
} from "class-validator";

class BaseCategoryTicketSettingsDto {
    @IsOptional()
    @IsUrl()
    @MaxLength(2000)
    bannerUrl?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    welcomeTitle?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    footerText?: string;

    @IsOptional()
    @IsString()
    @Matches(/^[0-9A-Fa-f]{6}$/, {
        message: "embedColor must be a valid 6-character hex color (without #)",
    })
    embedColor?: string;

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
    @IsBoolean({ message: "isActive must be boolean value" })
    isActive?: boolean;
}

export class CreateCategoryTicketSettingsDto extends BaseCategoryTicketSettingsDto {
    @IsString()
    categoryId: string;

    @IsString()
    @MaxLength(4000)
    welcomeMessage: string;

    @IsOptional()
    @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
    @IsBoolean({ message: "isActive must be boolean value" })
    isActive?: boolean = true;
}

export class UpdateCategoryTicketSettingsDto extends BaseCategoryTicketSettingsDto {
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    welcomeMessage?: string;
}

export class GetCategoryTicketSettingsDto {
    @IsString()
    categoryId: string;
}
