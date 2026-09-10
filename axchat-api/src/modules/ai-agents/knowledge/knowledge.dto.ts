import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertCompanyKnowledgeDto {
  @ApiPropertyOptional({ description: 'O que a empresa faz.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  whatWeDo?: string;

  @ApiPropertyOptional({ description: 'Produtos e serviços, com preço e posicionamento.' })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  products?: string;

  @ApiPropertyOptional({ description: 'Para quem é — e para quem NÃO é.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Por que escolher esta empresa.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  differentials?: string;

  @ApiPropertyOptional({ description: 'Tom de voz.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  toneOfVoice?: string;

  @ApiPropertyOptional({ description: 'Como agir — orientação.' })
  @IsOptional()
  @IsString()
  @MaxLength(12000)
  guidelines?: string;

  @ApiPropertyOptional({ description: 'O que NUNCA fazer — limite duro.' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  restrictions?: string;

  @ApiPropertyOptional({ description: 'Horários e prazos.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  serviceHours?: string;

  @ApiPropertyOptional({ description: 'Dúvidas frequentes com a resposta oficial.' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  faq?: string;
}

export class SetSectorKnowledgeDto {
  @ApiPropertyOptional({
    description: 'Conhecimento específico deste departamento. Vazio remove.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  knowledge?: string;
}

export class UpsertKnowledgeDocumentDto {
  @ApiProperty({ example: 'Política de reembolso' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({
    description:
      'Uma linha sobre QUANDO consultar. É o que vai no prompt — o agente decide buscar a partir daqui, então vale mais que o título.',
    example: 'Prazos e condições para devolver o dinheiro ao cliente.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  summary?: string;

  @ApiProperty({ description: 'O conteúdo completo do documento.' })
  @IsString()
  @MinLength(10)
  @MaxLength(200000)
  content: string;

  @ApiPropertyOptional({
    description:
      'Departamento dono. Vazio = vale para a empresa toda e todo agente enxerga no índice.',
  })
  @IsOptional()
  @IsString()
  sectorId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
