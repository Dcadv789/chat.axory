import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMetaCoexistenceDto {
  @ApiPropertyOptional({ description: 'Meta App ID (Tech Provider)' })
  @IsOptional()
  @IsString()
  appId?: string;

  @ApiPropertyOptional({ description: 'Meta App Secret — write-only, never returned' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiPropertyOptional({ description: 'Embedded Signup config_id for coexistence' })
  @IsOptional()
  @IsString()
  configId?: string;
}
