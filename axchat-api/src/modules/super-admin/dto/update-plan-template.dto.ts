import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdatePlanTemplateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxAgents!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxChannels!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDepartments!: number;

  @IsOptional()
  @IsBoolean()
  applyToExisting?: boolean;
}
