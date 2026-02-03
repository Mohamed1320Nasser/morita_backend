import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsNumber, IsObject } from "class-validator";
import { ManualPaymentType } from "@prisma/client";

export class CreatePaymentOptionDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(ManualPaymentType)
    @IsNotEmpty()
    type: ManualPaymentType;

    @IsOptional()
    @IsString()
    icon?: string;

    @IsObject()
    @IsNotEmpty()
    details: Record<string, any>;

    @IsOptional()
    @IsString()
    instructions?: string;
}

export class UpdatePaymentOptionDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEnum(ManualPaymentType)
    type?: ManualPaymentType;

    @IsOptional()
    @IsString()
    icon?: string;

    @IsOptional()
    @IsObject()
    details?: Record<string, any>;

    @IsOptional()
    @IsString()
    instructions?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsNumber()
    sortOrder?: number;
}

export class ReorderPaymentOptionsDto {
    @IsNotEmpty()
    orders: { id: string; sortOrder: number }[];
}
