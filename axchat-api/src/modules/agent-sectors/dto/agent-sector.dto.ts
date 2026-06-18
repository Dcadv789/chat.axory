import { IsString, IsOptional, IsArray, IsInt } from 'class-validator';

export class CreateAgentSectorDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateAgentSectorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class AddAgentToSectorDto {
  @IsString()
  agentId!: string;
}

export class ReorderSectorsDto {
  @IsArray()
  @IsString({ each: true })
  sectorIds!: string[];
}
