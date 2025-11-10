import { IsBoolean, IsOptional, IsPositive } from "class-validator";
import { Transform } from "class-transformer";
import { getListDto } from "../../common/dtos/getList.dto";
// import { getListDto } from "../../dtos/getList.dto";

export class getUsersListDto extends getListDto {
    @IsOptional()
    @Transform(({ value }) =>
        value === undefined ? value : Boolean(JSON.parse(value))
    )
    @IsBoolean({ message: "banned must be boolean value" })
    banned?: boolean;

    @IsOptional()
    @Transform(({ value }) =>
        value === undefined ? value : Number(JSON.parse(value))
    )
    @IsPositive({ each: true, message: "role Id must be positive number" })
    roleId?: number;
}
