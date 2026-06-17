import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateOrganizationPlanDto {
  @IsString()
  @IsOptional()
  plan?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  aiEnabled?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  aiMonthlyTokenCap?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  monthlyConversationLimit?: number | null;
}
