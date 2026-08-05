import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class SetMonthlyBudgetDto {
  @ApiProperty({ description: 'Verba do mês, em centavos. 0 = mês sem verba.' })
  @IsInt()
  @Min(0)
  amountCents!: number;

  @ApiPropertyOptional({ description: 'Observação livre (ex.: "mês de Black Friday").' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
