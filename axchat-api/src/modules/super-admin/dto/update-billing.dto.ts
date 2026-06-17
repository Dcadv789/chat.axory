import { BillingStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class UpdateBillingDto {
  @IsEnum(BillingStatus)
  @IsOptional()
  billingStatus?: BillingStatus;

  @IsEmail()
  @IsOptional()
  billingEmail?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  billingAmountCents?: number | null;

  @IsString()
  @IsOptional()
  billingCurrency?: string;

  @IsString()
  @IsOptional()
  billingCycle?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  billingDueDay?: number | null;

  @IsISO8601()
  @IsOptional()
  trialEndsAt?: string | null;

  @IsISO8601()
  @IsOptional()
  currentPeriodEndsAt?: string | null;
}
