import { IsOptional, IsIn, IsDateString, IsNumber, IsString, IsBoolean, IsEnum } from "class-validator";

// Query DTO for financial overview
export class FinancialOverviewQueryDto {
    @IsOptional()
    @IsIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'])
    period?: string;

    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;
}

// Expense Category Enum
export enum ExpenseCategory {
    SERVER_HOSTING = 'SERVER_HOSTING',
    PAYMENT_FEES = 'PAYMENT_FEES',
    MARKETING = 'MARKETING',
    SOFTWARE_LICENSES = 'SOFTWARE_LICENSES',
    DISCORD_BOT = 'DISCORD_BOT',
    MODERATION = 'MODERATION',
    REFUNDS = 'REFUNDS',
    CHARGEBACKS = 'CHARGEBACKS',
    WITHDRAWAL_FEES = 'WITHDRAWAL_FEES',
    OTHER = 'OTHER'
}

export enum RecurringFrequency {
    DAILY = 'DAILY',
    WEEKLY = 'WEEKLY',
    MONTHLY = 'MONTHLY',
    YEARLY = 'YEARLY'
}

// DTO for creating operational expense
export class CreateExpenseDto {
    @IsEnum(ExpenseCategory)
    category: ExpenseCategory;

    @IsNumber()
    amount: number;

    @IsString()
    description: string;

    @IsDateString()
    date: string;

    @IsBoolean()
    @IsOptional()
    recurring?: boolean;

    @IsEnum(RecurringFrequency)
    @IsOptional()
    frequency?: RecurringFrequency;

    @IsString()
    @IsOptional()
    reference?: string;
}
