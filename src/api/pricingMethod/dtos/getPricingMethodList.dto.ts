import {
    IsOptional,
    IsString,
    IsBoolean,
    IsInt,
    Min,
    Max,
    IsUUID,
} from "class-validator";
import { Transform } from "class-transformer";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetPricingMethodListDto extends getListDto {
    @IsOptional()
    @IsString()
    @IsUUID()
    serviceId?: string;

    @IsOptional()
    @IsBoolean()
    @Transform(({ value }) => value === "true")
    active?: boolean;

    @IsOptional()
    @IsString()
    pricingUnit?: string;

    @IsOptional()
    @IsString()
    sortBy?: string = "displayOrder";

    @IsOptional()
    @IsString()
    sortOrder?: "asc" | "desc" = "asc";
}
