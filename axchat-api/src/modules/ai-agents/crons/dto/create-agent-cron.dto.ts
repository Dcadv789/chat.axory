import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { isValidCronExpression } from '../cron-expression.util';

@ValidatorConstraint({ name: 'isCronExpression', async: false })
export class IsCronExpressionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidCronExpression(value);
  }
  defaultMessage(): string {
    return 'cronExpression precisa ser uma expressão cron de 5 campos válida (ex: "0 9 1 * *")';
  }
}

export class CreateAgentCronDto {
  @ApiProperty({ description: 'ID do agente que será disparado.' })
  @IsString()
  agentId!: string;

  @ApiProperty({ example: 'Revisão mensal de mídia' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example:
      'Revise a performance de mídia paga do último mês e proponha ajustes de budget.',
    description: 'O que o agente deve fazer quando o cron disparar.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(4000)
  task!: string;

  @ApiProperty({
    example: '0 9 1 * *',
    description: 'Expressão cron de 5 campos (min hora dia-mês mês dia-semana).',
  })
  @IsString()
  @Validate(IsCronExpressionConstraint)
  cronExpression!: string;

  @ApiPropertyOptional({ default: 'America/Sao_Paulo' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
