import {
    IsOptional,
    IsEnum,
    IsInt,
    Min,
    IsString,
} from "class-validator";
import { Type } from "class-transformer";
import { AccountCategory, AccountStatus } from "@prisma/client";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetAccountListDto extends getListDto {

    @IsEnum(AccountCategory)
    @IsOptional()
    category?: AccountCategory;

    @IsEnum(AccountStatus)
    @IsOptional()
    status?: AccountStatus;

    @IsString()
    @IsOptional()
    sortBy?: string = "createdAt";

    @IsString()
    @IsOptional()
    sortOrder?: "asc" | "desc" = "desc";
}
