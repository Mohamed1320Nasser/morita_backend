
import { IsOptional } from "class-validator";
import { PartialType } from "../../../common/helpers/dto.helper";
import { CreateAccountDto } from "./createAccount.dto";
import { Transform } from "class-transformer";

export class UpdateAccountDto extends PartialType(CreateAccountDto) {

    @IsOptional()
    @Transform(({ value }) => JSON.parse(value))
    deleteImageIds?: string[];
}
