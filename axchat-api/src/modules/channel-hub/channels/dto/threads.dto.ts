import {
  IsString,
  IsOptional,
  IsIn,
  IsArray,
  ValidateNested,
  IsBoolean,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ThreadsCarouselItemDto {
  @ApiProperty({ enum: ['IMAGE', 'VIDEO'] })
  @IsIn(['IMAGE', 'VIDEO'])
  mediaType: 'IMAGE' | 'VIDEO';

  @ApiPropertyOptional({ description: 'URL pública da imagem' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'URL pública do vídeo' })
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;
}

export class ThreadsPublishDto {
  @ApiProperty({ enum: ['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'] })
  @IsIn(['TEXT', 'IMAGE', 'VIDEO', 'CAROUSEL'])
  mediaType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';

  @ApiPropertyOptional({ description: 'Texto do post (até 500 caracteres)' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiPropertyOptional({ type: [ThreadsCarouselItemDto], description: '2 a 20 itens (carrossel)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ThreadsCarouselItemDto)
  children?: ThreadsCarouselItemDto[];
}

export class ThreadsReplyDto {
  @ApiProperty({ description: 'ID do post/resposta que está sendo respondido' })
  @IsString()
  replyToId: string;

  @ApiProperty()
  @IsString()
  text: string;
}

export class ThreadsHideReplyDto {
  @ApiProperty({ description: 'ID da resposta a ocultar/reexibir' })
  @IsString()
  replyId: string;

  @ApiProperty()
  @IsBoolean()
  hide: boolean;
}
