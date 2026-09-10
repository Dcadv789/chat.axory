import { IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

/** String vazia = apagar o override e voltar pro valor de env. */
export class UpdateEvolutionDto {
  // Mesmo critério do motor de IA: exige protocolo (senão o axios não monta a
  // requisição) mas aceita host sem TLD, pra permitir apontar pra localhost ou
  // pra um nome de serviço dentro do docker.
  @ValidateIf((_, v) => v !== '')
  @IsUrl(
    { require_tld: false, require_protocol: true, protocols: ['http', 'https'] },
    {
      message:
        'O endereço deve ser uma URL completa, com http:// ou https:// (ex: https://evolution.suaempresa.com)',
    },
  )
  @IsOptional()
  baseUrl?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;
}
