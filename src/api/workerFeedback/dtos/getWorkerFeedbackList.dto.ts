import { IsOptional, IsInt, IsEnum } from "class-validator";
import { Transform } from "class-transformer";
import { WorkerFeedbackType } from "@prisma/client";
import { getListDto } from "../../common/dtos/getList.dto";

export class GetWorkerFeedbackListDto extends getListDto {
    @IsOptional()
    @Transform(({ value }) => parseInt(value) || undefined)
    @IsInt()
    workerId?: number;

    @IsOptional()
    @IsEnum(WorkerFeedbackType)
    type?: WorkerFeedbackType;
}
