import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CoexistenceChannelDto {
  @ApiProperty({ example: 'WhatsApp Coexistência' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Authorization code returned by the Meta Embedded Signup popup',
  })
  @IsString()
  code: string;

  @ApiProperty({ description: 'phone_number_id returned by the popup' })
  @IsString()
  phoneNumberId: string;

  @ApiProperty({ description: 'WABA id (waba_id) returned by the popup' })
  @IsString()
  businessAccountId: string;

  @ApiPropertyOptional({ enum: ['ORG', 'PRIVATE'] })
  @IsOptional()
  @IsIn(['ORG', 'PRIVATE'])
  visibility?: 'ORG' | 'PRIVATE';
}
