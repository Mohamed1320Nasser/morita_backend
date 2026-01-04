import { Transform, Type } from 'class-transformer';
import {
  ValidateNested,
  IsString,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { BasePricingMethodDto } from './common.dto';

export class BatchPricingMethodItemDto extends BasePricingMethodDto {}

export class BatchCreatePricingMethodsDto {
  @IsString()
  @MinLength(1, { message: 'Service ID is required' })
  serviceId: string;

  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMinSize(1, { message: 'At least one pricing method is required' })
  @ArrayMaxSize(20, { message: 'Maximum 20 pricing methods per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchPricingMethodItemDto)
  pricingMethods: BatchPricingMethodItemDto[];
}
