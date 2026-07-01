import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  // Opcional: sessões normais renovam pelo cookie httpOnly (sem body). O body
  // segue aceito pra impersonação (super admin) e clients legados.
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
