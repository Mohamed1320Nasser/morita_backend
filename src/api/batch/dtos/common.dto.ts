import { Transform, Type } from 'class-transformer';
import {
  ValidateNested,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';

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

export class BatchModifierItemDto {
  @IsString()
  @MinLength(1, { message: 'Modifier name is required' })
  @MaxLength(100, { message: 'Modifier name must not exceed 100 characters' })
  name: string;

  @IsEnum(ModifierType, { message: 'Invalid modifier type' })
  modifierType: ModifierType;

  @Transform(({ value }) => parseInt(value) || null)
  @IsNumber({}, { message: 'Modifier value must be a number' })
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Condition must not exceed 1000 characters' })
  condition?: string;

  @IsOptional()
  @IsEnum(ModifierDisplayType, { message: 'Invalid modifier display type' })
  displayType?: ModifierDisplayType;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || null)
  @IsNumber({}, { message: 'Priority must be a number' })
  @Min(0)
  priority?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
  @IsBoolean({ message: "Active must be boolean value" })
  active?: boolean;
}

export class BasePricingMethodDto {
  @IsString()
  @MinLength(1, { message: 'Pricing method name is required' })
  @MaxLength(100, { message: 'Pricing method name must not exceed 100 characters' })
  name: string;

  @IsEnum(PricingUnit, { message: 'Invalid pricing unit' })
  pricingUnit: PricingUnit;

  @Transform(({ value }) => parseFloat(value) || null)
  @IsNumber({}, { message: 'basePrice must be a number' })
  basePrice: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || null)
  @IsNumber({}, { message: 'startLevel must be a number' })
  @Min(1)
  startLevel?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || null)
  @IsNumber({}, { message: 'endLevel must be a number' })
  @Min(1)
  endLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  description?: string;

  @IsOptional()
  @Transform(({ value }) => Number(value) || null)
  @IsNumber({}, { message: 'displayOrder must be a number' })
  displayOrder?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
  @IsBoolean({ message: "Active must be boolean value" })
  active?: boolean;
}
