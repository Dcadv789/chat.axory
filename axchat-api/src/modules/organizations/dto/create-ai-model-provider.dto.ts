import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreateAiModelProviderDto {
  @IsString()
  provider!: string;

  @IsString()
  name!: string;

  @IsString()
  modelId!: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;
}

export class UpdateAiModelProviderDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
