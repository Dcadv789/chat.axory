import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const ANALYSIS_WINDOWS = [
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'LAST_YEAR',
] as const;

export class UpsertMarketingProfileDto {
  @ApiPropertyOptional({ description: 'O que a empresa faz.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  companyDescription?: string;

  @ApiPropertyOptional({ description: 'Produtos/serviços oferecidos.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  products?: string;

  @ApiPropertyOptional({ description: 'Público-alvo padrão.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Tom de voz da marca.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toneOfVoice?: string;

  @ApiPropertyOptional({ description: 'Diretrizes/limites (o que pode e não pode).' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  guidelines?: string;

  @ApiPropertyOptional({ description: 'Teto de verba mensal de mídia, em centavos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyAdBudgetCents?: number;

  @ApiPropertyOptional({ description: 'Teto de orçamento diário por campanha, em centavos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDailyBudgetCents?: number;

  @ApiPropertyOptional({ description: 'Moeda (ISO). Default BRL.' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({
    description:
      'Nome de uma AiSkill SQL que busca regras num banco externo (opcional).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalRulesSkill?: string;

  @ApiPropertyOptional({
    description:
      'Janela de tempo que a crew usa ao analisar posts/dados.',
    enum: ANALYSIS_WINDOWS,
  })
  @IsOptional()
  @IsIn(ANALYSIS_WINDOWS as unknown as string[])
  analysisWindow?: string;
}
