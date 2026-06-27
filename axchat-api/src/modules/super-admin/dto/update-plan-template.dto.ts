import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Todos os campos são opcionais: o serviço mescla apenas o que vier sobre o
 * template atual. Preços em centavos (BRL).
 */
export class UpdatePlanTemplateDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // ── Comercial ──
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pricePerSeatCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSeats?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  suiteFlatCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  aiConversations?: number;

  @IsOptional()
  @IsBoolean()
  includesMarketing?: boolean;

  @IsOptional()
  @IsBoolean()
  includesAssistant?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  setupFeeCents?: number;

  // ── Operacional ──
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAgents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxChannels?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDepartments?: number;

  @IsOptional()
  @IsBoolean()
  applyToExisting?: boolean;
}
