import { PartialType } from "../../../common/helpers/dto.helper";
import { CreatePricingMethodDto } from "./createPricingMethod.dto";
export class UpdatePricingMethodDto extends PartialType(
    CreatePricingMethodDto
) {}
