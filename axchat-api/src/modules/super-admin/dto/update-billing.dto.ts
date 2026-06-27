import { BillingStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, Min } from 'class-validator';

/** Termos comerciais negociados por empresa (override do template) + desconto. */
export class BillingProfileDto {
  seats?: number;
  pricePerSeatCents?: number;
  suiteFlatCents?: number;
  aiConversations?: number;
  includesMarketing?: boolean;
  includesAssistant?: boolean;
  setupFeeCents?: number;
  discountType?: 'NONE' | 'PERCENT' | 'FIXED';
  discountValue?: number; // PERCENT: 0-100; FIXED: centavos
  discountReason?: string;
  notes?: string;
}

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

  @IsObject()
  @IsOptional()
  billingProfile?: BillingProfileDto;
}
