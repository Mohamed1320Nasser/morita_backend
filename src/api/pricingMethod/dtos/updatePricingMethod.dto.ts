import {
    IsString,
    IsOptional,
    IsBoolean,
    IsInt,
    Min,
    MaxLength,
    IsDecimal,
    IsEnum,
} from "class-validator";
import { PricingUnit } from "@prisma/client";
import { PartialType } from "../../../common/helpers/dto.helper";
import { CreatePricingMethodDto } from "./createPricingMethod.dto";

export class UpdatePricingMethodDto extends PartialType(
    CreatePricingMethodDto
) {}
