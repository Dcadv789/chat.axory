import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SECTORS = ['ATENDIMENTO', 'MARKETING', 'PESSOAL'] as const;

export class CloneAgentsDto {
  @ApiProperty({ description: 'ID da empresa-modelo (origem da cópia).' })
  @IsString()
  sourceOrgId!: string;

  @ApiProperty({ description: 'ID da empresa destino (recebe os agentes).' })
  @IsString()
  targetOrgId!: string;

  @ApiProperty({
    description: 'Setores a clonar por inteiro (ATENDIMENTO, MARKETING, PESSOAL).',
    isArray: true,
    enum: SECTORS,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(SECTORS, { each: true })
  sectors!: (typeof SECTORS)[number][];

  @ApiPropertyOptional({
    description:
      'Departamentos a clonar (ex.: CONTABIL, JURIDICO). Vazio/ausente = todos os departamentos dos setores escolhidos.',
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departments?: string[];
}
