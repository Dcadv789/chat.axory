import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
}
