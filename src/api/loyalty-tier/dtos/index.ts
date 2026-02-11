import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

/**
 * DTO for creating a new loyalty tier
 */
export class CreateLoyaltyTierDto {
  @IsString()
  name: string;

  @IsString()
  emoji: string;

  @IsNumber()
  @Min(0)
  minSpending: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSpending?: number | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;

  @IsOptional()
  @IsString()
  discordRoleId?: string | null;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for updating an existing loyalty tier
 */
export class UpdateLoyaltyTierDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  emoji?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpending?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSpending?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  discordRoleId?: string | null;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO for tier information response
 */
export class LoyaltyTierDto {
  id: string;
  name: string;
  emoji: string;
  minSpending: number;
  maxSpending: number | null;
  discountPercent: number;
  discordRoleId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * DTO for user's loyalty tier information
 */
export class UserLoyaltyTierDto {
  currentTier: LoyaltyTierDto | null;
  totalSpent: number;
  nextTier: LoyaltyTierDto | null;
  amountUntilNextTier: number | null;
  tierHistory: TierHistoryDto[];
}

/**
 * DTO for tier history record
 */
export class TierHistoryDto {
  id: string;
  fromTierId: string | null;
  toTierId: string;
  totalSpent: number;
  changedAt: Date;
  reason: string | null;
  tier: LoyaltyTierDto;
}

/**
 * DTO for loyalty discount calculation
 */
export class LoyaltyDiscountDto {
  originalPrice: number;
  discountPercent: number;
  discountAmount: number;
  finalPrice: number;
  tierName: string;
  tierEmoji: string;
}
