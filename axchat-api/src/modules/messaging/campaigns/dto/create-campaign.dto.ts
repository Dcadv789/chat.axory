import { IsString, IsOptional, IsIn, IsArray, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AudienceDto {
  @ApiProperty({ enum: ['all', 'tag', 'campaign'] })
  @IsIn(['all', 'tag', 'campaign'])
  mode: 'all' | 'tag' | 'campaign';

  @ApiPropertyOptional() @IsOptional() @IsString() tagId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() campaign?: string;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;

  @ApiProperty({ description: 'ID do canal por onde disparar' })
  @IsString()
  channelId: string;

  @ApiProperty({ enum: ['TEXT', 'TEMPLATE'] })
  @IsIn(['TEXT', 'TEMPLATE'])
  messageType: 'TEXT' | 'TEMPLATE';

  /** Texto livre (messageType=TEXT). Use {{nome}} para o nome do contato. */
  @ApiPropertyOptional() @IsOptional() @IsString() text?: string;

  /** Template (messageType=TEMPLATE): nome + idioma + parâmetros do corpo. */
  @ApiPropertyOptional() @IsOptional() @IsString() templateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateLanguage?: string;
  @ApiPropertyOptional({ type: [String], description: 'Valores dos {{1}},{{2}}… do corpo. {{nome}} vira o nome do contato.' })
  @IsOptional() @IsArray() @IsString({ each: true })
  templateBodyParams?: string[];

  @ApiProperty({ type: AudienceDto })
  @ValidateNested()
  @Type(() => AudienceDto)
  @IsObject()
  audience: AudienceDto;
}
