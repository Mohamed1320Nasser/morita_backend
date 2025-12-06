import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsUUID,
} from "class-validator";

export class CreateServiceDto {
    @IsString()
    @IsUUID()
    categoryId: string;

    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    slug?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    emoji?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    imageUrl?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean = true;

    @IsOptional()
    @IsInt()
    @Min(0)
    displayOrder?: number = 0;
}
