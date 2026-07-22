import { IsString, IsOptional, IsArray, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() campaign?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  /** Nomes de tags (cria as que não existem e associa). */
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

/** Uma linha da planilha importada (o front já parseia o CSV). */
export class ImportContactRow {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() campaign?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ImportContactsDto {
  @ApiProperty({ type: [ImportContactRow], description: 'Linhas da planilha (máx. 5000)' })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportContactRow)
  contacts: ImportContactRow[];

  @ApiPropertyOptional({ description: 'Campanha aplicada a todos os contatos importados (sobrescreve o da linha se vazio)' })
  @IsOptional()
  @IsString()
  campaign?: string;
}
