import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduledPostNetwork } from '@prisma/client';

export class AgendarPostDto {
  @ApiProperty({ enum: ScheduledPostNetwork })
  @IsEnum(ScheduledPostNetwork)
  network!: ScheduledPostNetwork;

  @ApiProperty({
    description:
      'Quando publicar, em ISO 8601 COM fuso (ex.: 2026-08-10T14:30:00-03:00). Sem o fuso, o horário do cliente e o do servidor divergem e o post sai na hora errada.',
    example: '2026-08-10T14:30:00-03:00',
  })
  @IsISO8601({ strict: true })
  scheduledFor!: string;

  @ApiPropertyOptional({ description: 'Legenda (Instagram) ou texto (Threads).' })
  @IsOptional()
  @IsString()
  @MaxLength(2200)
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional({ type: [String], description: 'Carrossel: 2 a 10 URLs.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  carouselUrls?: string[];

  @ApiPropertyOptional({ description: 'Conta do Instagram escolhida no painel.' })
  @IsOptional()
  @IsString()
  channelId?: string;
}

export class ReagendarPostDto {
  @ApiProperty({ example: '2026-08-10T14:30:00-03:00' })
  @IsISO8601({ strict: true })
  scheduledFor!: string;
}
