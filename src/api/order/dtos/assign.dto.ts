import { Transform } from "class-transformer";
import {
    IsString,
    IsNumber,
    IsOptional,
} from "class-validator";

export class AssignWorkerDto {
    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    workerId!: number;

    @IsNumber()
    @Transform(({ value }) => parseInt(value) || null)
    assignedById!: number;

    @IsString()
    @IsOptional()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    notes?: string;
}
