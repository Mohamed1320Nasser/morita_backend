import { IsOptional, IsInt, Min, IsString } from "class-validator";
import { Transform } from "class-transformer";

export class GetAllClaimsDto {
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || 1)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Transform(({ value }) => parseInt(value) || 10)
    @IsInt()
    @Min(1)
    limit?: number = 10;

    @IsOptional()
    @IsString()
    search?: string;
}
