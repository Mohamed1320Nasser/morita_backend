import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
} from "class-validator";

export class CreateServiceCategoryDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    emoji?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    icon?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean = true;

    @IsOptional()
    @IsInt()
    @Min(0)
    displayOrder?: number = 0;
}
