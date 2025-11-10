import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsDecimal,
    IsEnum,
} from "class-validator";
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
    @IsDecimal({ decimal_digits: "0,2" })
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
