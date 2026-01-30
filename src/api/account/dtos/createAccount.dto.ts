import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    Min,
} from "class-validator";
import { AccountCategory, AccountStatus } from "@prisma/client";
import { Transform } from "class-transformer";

export class CreateAccountDto {
    @IsString()
    name: string;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber({},{ message: 'Price must be a number' })
    @Min(0)
    price: number;

    @Transform(({ value }) => parseInt(value))
    @IsOptional({message: 'Quantity must be a number'})
    @Min(1)
    quantity?: number = 1;

    @IsString()
    @IsOptional()
    source?: string;

    @IsEnum(AccountCategory)
    category: AccountCategory;

    @IsOptional()
    @Transform(({ value }) => JSON.parse(value))
    accountData?: any;

    @IsOptional()
    @IsEnum(AccountStatus)
    status?: AccountStatus;
}
