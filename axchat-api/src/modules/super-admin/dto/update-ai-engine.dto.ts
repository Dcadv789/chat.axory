import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** String vazia = apagar o override e voltar pro valor de env. */
export class AiEngineSlotDto {
  // `require_protocol` é o que impede um host solto ("api.exemplo.com", ou pior,
  // "nao-e-url") de ser aceito — o SDK precisa de http(s):// pra montar a
  // requisição. `require_tld: false` fica de fora pra permitir localhost.
  @ValidateIf((_, v) => v !== '')
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    { message: 'baseUrl deve ser uma URL completa, com http:// ou https://' },
  )
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;

  @IsString()
  @IsOptional()
  modelId?: string;
}

export class UpdateAiEngineDto {
  @ValidateNested()
  @Type(() => AiEngineSlotDto)
  @IsOptional()
  text?: AiEngineSlotDto;

  @ValidateNested()
  @Type(() => AiEngineSlotDto)
  @IsOptional()
  vision?: AiEngineSlotDto;

  @ValidateNested()
  @Type(() => AiEngineSlotDto)
  @IsOptional()
  audio?: AiEngineSlotDto;
}

export class TestAiEngineDto {
  @IsEnum(['text', 'vision', 'audio'])
  kind!: 'text' | 'vision' | 'audio';
}
