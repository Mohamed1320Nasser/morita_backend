import { Transform } from "class-transformer";
import { IsUUID } from "class-validator";

export class BaseOTPRequestDto {
    @IsUUID(undefined, { message: "Request ID must be a valid UUID" })
    @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
    requestId: string;
}

export class ResendOTPDto extends BaseOTPRequestDto {}

