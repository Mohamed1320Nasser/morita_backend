import {
    IsString,
    IsOptional,
    IsBoolean,
    MaxLength,
    IsUrl,
    Matches,
} from "class-validator";

export class CreateCategoryTicketSettingsDto {
    @IsString()
    categoryId: string;

    @IsOptional()
    @IsUrl()
    @MaxLength(2000)
    bannerUrl?: string;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    welcomeTitle?: string;

    @IsString()
    @MaxLength(4000)
    welcomeMessage: string;

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
    @IsBoolean()
    isActive?: boolean = true;
}

export class UpdateCategoryTicketSettingsDto {
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
    @MaxLength(4000)
    welcomeMessage?: string;

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
    @IsBoolean()
    isActive?: boolean;
}

export class GetCategoryTicketSettingsDto {
    @IsString()
    categoryId: string;
}
