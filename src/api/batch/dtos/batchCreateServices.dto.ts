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
} from 'class-validator';

export class BatchServiceItemDto {
  @IsString()
  @MinLength(1, { message: 'Service name is required' })
  name: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value) || null)
  @IsNumber({}, { message: 'displayOrder must be a number' })
  displayOrder?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Boolean(JSON.parse(value))))
  @IsBoolean({ message: "homeView must be boolean value" })
  active?: boolean;
}

export class BatchCreateServicesDto {
  @IsString()
  @MinLength(1, { message: 'Category ID is required' })
  categoryId: string;

  @Transform(({ value }) => (typeof value == "string" ? JSON.parse(value) : value))
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @ArrayMaxSize(50, { message: 'Maximum 50 services per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchServiceItemDto)
  services: BatchServiceItemDto[];
}
