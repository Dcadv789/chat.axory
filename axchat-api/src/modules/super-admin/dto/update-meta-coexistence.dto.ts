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

  @ApiPropertyOptional({ description: 'Embedded Signup config_id for coexistence (QR)' })
  @IsOptional()
  @IsString()
  configId?: string;

  @ApiPropertyOptional({
    description: 'Embedded Signup config_id for standard WhatsApp Official (create/select WABA)',
  })
  @IsOptional()
  @IsString()
  embeddedConfigId?: string;

  @ApiPropertyOptional({
    description: 'Facebook Login for Business config_id for Instagram (IG + Pages permissions)',
  })
  @IsOptional()
  @IsString()
  instagramConfigId?: string;

  @ApiPropertyOptional({ description: 'Threads App ID (Threads API app — OAuth threads.net)' })
  @IsOptional()
  @IsString()
  threadsAppId?: string;

  @ApiPropertyOptional({ description: 'Threads App Secret — write-only, never returned' })
  @IsOptional()
  @IsString()
  threadsAppSecret?: string;
}
