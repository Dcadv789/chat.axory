import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Onboarding do Instagram via Facebook Login for Business (FLB). O popup da
 * Meta devolve só um `code`; o backend troca por token, descobre a Página do
 * Facebook + a conta profissional do Instagram vinculada e monta o canal.
 */
export class InstagramFacebookLoginDto {
  @ApiProperty({ example: 'Instagram da Loja' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Authorization code returned by the Facebook Login for Business popup',
  })
  @IsString()
  code: string;

  @ApiPropertyOptional({ enum: ['ORG', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['ORG', 'PRIVATE'])
  visibility?: 'ORG' | 'PRIVATE';
}
