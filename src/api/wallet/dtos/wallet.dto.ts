import {
    IsString,
    IsNumber,
    IsOptional,
    IsEnum,
    IsUUID,
    Min,
    IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

// Wallet Types enum (matches Prisma)
export enum WalletType {
    CUSTOMER = "CUSTOMER",
    WORKER = "WORKER",
    SUPPORT = "SUPPORT",
}

// Transaction Types enum (matches Prisma)
export enum WalletTransactionType {
    DEPOSIT = "DEPOSIT",
    WITHDRAWAL = "WITHDRAWAL",
    PAYMENT = "PAYMENT",
    REFUND = "REFUND",
    EARNING = "EARNING",
    COMMISSION = "COMMISSION",
    SYSTEM_FEE = "SYSTEM_FEE",
    ADJUSTMENT = "ADJUSTMENT",
    RELEASE = "RELEASE",
}

// Transaction Status enum (matches Prisma)
export enum WalletTransactionStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    REVERSED = "REVERSED",
}

// DTO for creating a wallet
export class CreateWalletDto {
    @IsNumber()
    userId!: number;

    @IsEnum(WalletType)
    @IsOptional()
    walletType?: WalletType = WalletType.CUSTOMER;

    @IsString()
    @IsOptional()
    currency?: string = "USD";
}

// DTO for adding balance (deposit)
export class AddBalanceDto {
    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount!: number;

    @IsEnum(WalletTransactionType)
    @IsOptional()
    transactionType?: WalletTransactionType = WalletTransactionType.DEPOSIT;

    @IsString()
    @IsOptional()
    paymentMethodId?: string;

    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsString()
    @IsOptional()
    currency?: string = "USD";
}

// DTO for add balance via Discord (in ticket)
export class DiscordAddBalanceDto {
    @IsString()
    customerDiscordId!: string;

    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount!: number;

    @IsString()
    @IsOptional()
    transactionType?: string = "DEPOSIT";

    @IsString()
    @IsOptional()
    paymentMethodId?: string;

    @IsString()
    @IsOptional()
    reference?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsNumber()
    @Type(() => Number)
    createdById!: number;
}

// DTO for deducting balance (payment)
export class DeductBalanceDto {
    @IsNumber()
    @Min(0.01)
    @Type(() => Number)
    amount!: number;

    @IsString()
    @IsOptional()
    orderId?: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsBoolean()
    @IsOptional()
    lockAsPending?: boolean = false; // If true, move to pendingBalance instead of deducting
}

// DTO for getting wallet list
export class GetWalletListDto {
    @IsString()
    @IsOptional()
    search?: string;

    @IsEnum(WalletType)
    @IsOptional()
    walletType?: WalletType;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;

    @IsString()
    @IsOptional()
    sortBy?: string = "createdAt";

    @IsString()
    @IsOptional()
    sortOrder?: "asc" | "desc" = "desc";
}

// DTO for getting transaction history
export class GetTransactionHistoryDto {
    @IsString()
    @IsOptional()
    walletId?: string;

    @IsEnum(WalletTransactionType)
    @IsOptional()
    type?: WalletTransactionType;

    @IsEnum(WalletTransactionStatus)
    @IsOptional()
    status?: WalletTransactionStatus;

    @IsString()
    @IsOptional()
    search?: string;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    page?: number = 1;

    @IsNumber()
    @IsOptional()
    @Type(() => Number)
    limit?: number = 20;

    @IsString()
    @IsOptional()
    sortOrder?: "asc" | "desc" = "desc";
}

// DTO for updating wallet
export class UpdateWalletDto {
    @IsEnum(WalletType)
    @IsOptional()
    walletType?: WalletType;

    @IsBoolean()
    @IsOptional()
    isActive?: boolean;

    @IsString()
    @IsOptional()
    currency?: string;
}
