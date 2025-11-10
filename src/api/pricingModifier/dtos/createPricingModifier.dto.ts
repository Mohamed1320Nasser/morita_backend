import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsUUID,
    IsDecimal,
    IsEnum,
} from "class-validator";
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

    @IsDecimal({ decimal_digits: "0,2" })
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
