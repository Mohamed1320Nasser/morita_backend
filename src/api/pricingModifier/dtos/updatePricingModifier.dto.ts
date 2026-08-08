import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    IsNumber,
    Min,
    MaxLength,
    IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { ModifierType } from "@prisma/client";

export class UpdatePricingModifierDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsEnum(ModifierType)
    modifierType?: ModifierType;

    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    value?: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    condition?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}
