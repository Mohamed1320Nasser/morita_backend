import {
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    MaxLength,
} from "class-validator";
import { PaymentType } from "@prisma/client";

export class CreatePaymentMethodDto {
    @IsString()
    @MaxLength(100)
    name: string;

    @IsEnum(PaymentType)
    type: PaymentType;

    @IsOptional()
    @IsBoolean()
    active?: boolean = true;
}
