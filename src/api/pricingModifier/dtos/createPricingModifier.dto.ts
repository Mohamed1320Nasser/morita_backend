import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    IsNumber,
    Min,
    MaxLength,
    IsUUID,
    IsEnum,
} from "class-validator";
import { Type } from "class-transformer";
import { ModifierType } from "@prisma/client";

export class CreatePricingModifierDto {
    @IsString()
    @IsUUID()
    methodId: string;

    @IsString()
    @MaxLength(100)
    name: string;

    @IsEnum(ModifierType)
    modifierType: ModifierType;

    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    value: number;

    @IsOptional()
    @IsString()
    @MaxLength(1000)
    condition?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    priority?: number = 0;

    @IsOptional()
    @IsBoolean()
    active?: boolean = true;
}
