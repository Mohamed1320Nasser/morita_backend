import { Transform, Type } from 'class-transformer';
import {
  ValidateNested,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';
import { BasePricingMethodDto, BatchModifierItemDto } from './common.dto';

export class BatchPricingMethodItemDto extends BasePricingMethodDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMaxSize(20, { message: 'Maximum 20 modifiers per pricing method' })
  @ValidateNested({ each: true })
  @Type(() => BatchModifierItemDto)
  modifiers?: BatchModifierItemDto[];
}

export class BatchServiceWithPricingItemDto {
  @IsString()
  @MinLength(1, { message: 'Service name is required' })
  @MaxLength(100, { message: 'Service name must not exceed 100 characters' })
  name: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Image URL must not exceed 500 characters' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value) || null)
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
 @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
  @IsBoolean({ message: "homeView must be boolean value" })
  active?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMaxSize(20, { message: 'Maximum 20 service modifiers per service' })
  @ValidateNested({ each: true })
  @Type(() => BatchModifierItemDto)
  serviceModifiers?: BatchModifierItemDto[];

  @IsOptional()
  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMaxSize(20, { message: 'Maximum 20 pricing methods per service' })
  @ValidateNested({ each: true })
  @Type(() => BatchPricingMethodItemDto)
  pricingMethods?: BatchPricingMethodItemDto[];
}

export class BatchCreateServicesWithPricingDto {
  @IsString()
  @MinLength(1, { message: 'Category ID is required' })
  categoryId: string;

  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @ArrayMaxSize(20, { message: 'Maximum 20 services per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchServiceWithPricingItemDto)
  services: BatchServiceWithPricingItemDto[];
}
