import { Transform, Type } from "class-transformer";
import { IsOptional, IsPositive, IsString } from "class-validator";

export class getListDto {
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    @IsPositive({ message: "limit must be positive number" })
    limit: number = 10;

    @IsOptional()
    @Transform(({ value }) => parseInt(value) || null)
    @IsPositive({ message: "page must be positive number" })
    page: number = 1;

    @IsOptional()
    @IsString({ message: "search must be a vaild string" })
    search: string = "";

    @IsOptional()
    @IsString({ message: "order must be a vaild string" })
    order: "ASC" | "DESC" = "DESC";
}
