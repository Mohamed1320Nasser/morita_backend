import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
  IsEnum,
} from 'class-validator';

export enum PricingUnit {
  FIXED = 'FIXED',
  PER_LEVEL = 'PER_LEVEL',
  PER_KILL = 'PER_KILL',
  PER_ITEM = 'PER_ITEM',
  PER_HOUR = 'PER_HOUR',
}

export class BatchPricingMethodItemDto {
  @IsString()
  @MinLength(1, { message: 'Pricing method name is required' })
  name: string;

  @IsEnum(PricingUnit)
  pricingUnit: PricingUnit;

  @IsNumber()
  basePrice: number;

  @IsOptional()
  @IsNumber()
  startLevel?: number;

  @IsOptional()
  @IsNumber()
  endLevel?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BatchCreatePricingMethodsDto {
  @IsString()
  @MinLength(1, { message: 'Service ID is required' })
  serviceId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one pricing method is required' })
  @ArrayMaxSize(20, { message: 'Maximum 20 pricing methods per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchPricingMethodItemDto)
  pricingMethods: BatchPricingMethodItemDto[];
}
