import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpsertCampaignBriefDto {
  @ApiProperty({ example: 'Captação BPO contábil — Q3' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'O que esta campanha está tentando conseguir.',
    example: 'Gerar 15 reuniões/mês com sócios de escritórios contábeis.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  objective: string;

  @ApiPropertyOptional({
    description:
      'Público DESTA campanha. Vazio = usa o público padrão do perfil da empresa.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Oferta/produto que esta campanha empurra.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  offer?: string;

  @ApiPropertyOptional({ description: 'Mensagem central / ângulo da campanha.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  keyMessage?: string;

  @ApiPropertyOptional({
    description:
      'O que NÃO fazer nesta campanha. Soma-se às restrições gerais da empresa, não substitui.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  restrictions?: string;

  @ApiPropertyOptional({
    description:
      'IDs dos anúncios do Meta que pertencem a esta campanha — é o que liga o briefing ao resultado medido.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  adIds?: string[];

  @ApiPropertyOptional({ description: 'Verba mensal desta campanha, em centavos.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyBudgetCents?: number;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'Início da campanha (ISO).' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ description: 'Fim da campanha (ISO).' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}
