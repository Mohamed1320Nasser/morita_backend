import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    MaxLength,
} from "class-validator";
import { PaymentType } from "@prisma/client";

export class UpdatePaymentMethodDto {
    @IsOptional()
    @IsString()
    @MaxLength(100)
    name?: string;

    @IsOptional()
    @IsEnum(PaymentType)
    type?: PaymentType;

    @IsOptional()
    @IsBoolean()
    active?: boolean;
}
