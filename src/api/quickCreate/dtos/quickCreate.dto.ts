import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsUUID,
    IsArray,
    ValidateNested,
    IsEnum,
    IsNumber,
} from "class-validator";
import { Type } from "class-transformer";

// Category can be either existing (by ID) or new (with data)
export class CategoryDataDto {
    @IsOptional()
    @IsString()
    mode?: "existing" | "new";

    @IsOptional()
    @IsUUID()
    existingId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    emoji?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class ServiceDataDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(10)
    emoji?: string;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    displayOrder?: number;
}

export enum PricingUnitEnum {
    FIXED = "FIXED",
    PER_LEVEL = "PER_LEVEL",
    PER_KILL = "PER_KILL",
    PER_ITEM = "PER_ITEM",
    PER_HOUR = "PER_HOUR",
}

export enum ModifierTypeEnum {
    PERCENTAGE = "PERCENTAGE",
    FIXED = "FIXED",
}

export enum ModifierDisplayTypeEnum {
    NORMAL = "NORMAL",
    UPCHARGE = "UPCHARGE",
    NOTE = "NOTE",
    WARNING = "WARNING",
}

export class ModifierDataDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsEnum(ModifierTypeEnum)
    modifierType: ModifierTypeEnum;

    @IsNumber()
    value: number;

    @IsOptional()
    @IsString()
    condition?: string;

    @IsOptional()
    @IsEnum(ModifierDisplayTypeEnum)
    displayType?: ModifierDisplayTypeEnum;

    @IsOptional()
    @IsInt()
    priority?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}

export class PricingMethodDataDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsEnum(PricingUnitEnum)
    pricingUnit: PricingUnitEnum;

    @IsNumber()
    basePrice: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    description?: string;

    @IsOptional()
    @IsInt()
    startLevel?: number;

    @IsOptional()
    @IsInt()
    endLevel?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    displayOrder?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ModifierDataDto)
    modifiers?: ModifierDataDto[];
}

export class QuickCreateDto {
    @ValidateNested()
    @Type(() => CategoryDataDto)
    category: CategoryDataDto;

    @ValidateNested()
    @Type(() => ServiceDataDto)
    service: ServiceDataDto;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PricingMethodDataDto)
    methods?: PricingMethodDataDto[];
}
