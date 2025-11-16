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
  @IsNumber()
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class BatchCreateServicesDto {
  @IsString()
  @MinLength(1, { message: 'Category ID is required' })
  categoryId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one service is required' })
  @ArrayMaxSize(50, { message: 'Maximum 50 services per batch' })
  @ValidateNested({ each: true })
  @Type(() => BatchServiceItemDto)
  services: BatchServiceItemDto[];
}
