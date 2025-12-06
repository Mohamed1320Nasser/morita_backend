import { Type } from 'class-transformer';
import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  MinLength,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  IsDecimal,
  Min,
} from 'class-validator';

// Enums matching Prisma schema
export enum PricingUnit {
  FIXED = 'FIXED',
  PER_LEVEL = 'PER_LEVEL',
  PER_KILL = 'PER_KILL',
  PER_ITEM = 'PER_ITEM',
  PER_HOUR = 'PER_HOUR',
}

export enum ModifierType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum ModifierDisplayType {
  NORMAL = 'NORMAL',
  UPCHARGE = 'UPCHARGE',
  NOTE = 'NOTE',
  WARNING = 'WARNING',
}

/**
 * DTO for a single pricing modifier within a pricing method
 */
export class BatchModifierItemDto {
  @IsString()
  @MinLength(1, { message: 'Modifier name is required' })
  @MaxLength(100, { message: 'Modifier name must not exceed 100 characters' })
  name: string;

  @IsEnum(ModifierType)
  modifierType: ModifierType;

  @IsNumber()
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Condition must not exceed 1000 characters' })
  condition?: string;

  @IsOptional()
  @IsEnum(ModifierDisplayType)
  displayType?: ModifierDisplayType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/**
 * DTO for a single pricing method within a service
 */
export class BatchPricingMethodItemDto {
  @IsString()
  @MinLength(1, { message: 'Pricing method name is required' })
  @MaxLength(100, { message: 'Pricing method name must not exceed 100 characters' })
  name: string;

  @IsEnum(PricingUnit)
  pricingUnit: PricingUnit;

  @IsNumber()
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  startLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  endLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Maximum 20 modifiers per pricing method' })
  @ValidateNested({ each: true })
  @Type(() => BatchModifierItemDto)
  modifiers?: BatchModifierItemDto[];
}

/**
 * DTO for a single service with its pricing methods
 */
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
  @MaxLength(1000, { message: 'Description must not exceed 1000 characters' })
  description?: string;

  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Maximum 20 service modifiers per service' })
  @ValidateNested({ each: true })
  @Type(() => BatchModifierItemDto)
  serviceModifiers?: BatchModifierItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'Maximum 20 pricing methods per service' })
  @ValidateNested({ each: true })
  @Type(() => BatchPricingMethodItemDto)
  pricingMethods?: BatchPricingMethodItemDto[];
}

/**
 * Main DTO for batch creating services with pricing methods and modifiers
 */
export class BatchCreateServicesWithPricingDto {
  @IsString()
  @MinLength(1, { message: 'Category ID is required' })
  categoryId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @ArrayMaxSize(20, { message: 'Maximum 20 services per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchServiceWithPricingItemDto)
  services: BatchServiceWithPricingItemDto[];
}
