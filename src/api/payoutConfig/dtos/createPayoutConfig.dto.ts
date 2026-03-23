import { IsNumber, Min, Max } from "class-validator";

export class CreatePayoutConfigDto {
    @IsNumber()
    @Min(0)
    @Max(100)
    workerPercentage: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    supportPercentage: number;

    @IsNumber()
    @Min(0)
    @Max(100)
    systemPercentage: number;
}
