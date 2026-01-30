import { IsOptional, IsInt, Min, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { AccountCategory } from "@prisma/client";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetAccountViewListDto extends getListDto {
    @IsOptional()
    @IsEnum(AccountCategory)
    category?: AccountCategory;

}
