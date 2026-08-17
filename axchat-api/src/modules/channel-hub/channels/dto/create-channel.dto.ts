import { IsEnum, IsString, IsOptional, IsObject, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AiAgentSector, ChannelType } from '@prisma/client';

export class CreateChannelDto {
  @ApiProperty({ enum: ChannelType })
  @IsEnum(ChannelType)
  type: ChannelType;

  @ApiProperty({ example: 'WhatsApp Principal' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Provider credentials (token for Zappfy, accessToken/phoneNumberId for WhatsApp Official)',
    example: { token: 'zappfy-instance-token' },
  })
  @IsObject()
  config: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({ enum: ['ORG', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['ORG', 'PRIVATE'])
  visibility?: 'ORG' | 'PRIVATE';

  /**
   * Frente do canal: qual equipe de IA atende aqui. É o que impede um agente
   * de operação interna de ser vinculado ao canal do cliente.
   */
  @ApiPropertyOptional({ enum: AiAgentSector })
  @IsOptional()
  @IsEnum(AiAgentSector)
  sector?: AiAgentSector;
}
