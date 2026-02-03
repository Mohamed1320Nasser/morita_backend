import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
    IsArray,
    IsUrl,
} from "class-validator";

export class CompleteOrderDto {
    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    orderId!: string;

    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    workerId!: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    completionNotes?: string;

    @IsArray()
    @IsUrl({}, { each: true })
    @IsOptional()
    completionScreenshots?: string[];
}
