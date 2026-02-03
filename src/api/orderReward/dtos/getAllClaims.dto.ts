import { IsOptional, IsInt, Min, IsString } from "class-validator";
import { Transform } from "class-transformer";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetAllOrderRewardClaimsDto extends getListDto {
}
