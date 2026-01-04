import { Transform } from "class-transformer";
import { IsString } from "class-validator";

export class ClaimOrderDto {
    @IsString()
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    workerDiscordId!: string;
}
