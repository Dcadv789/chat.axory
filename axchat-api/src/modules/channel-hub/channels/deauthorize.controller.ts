import { Body, Controller, Logger, Param, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';

/**
 * Callbacks de desautorização da Meta (Threads e Instagram).
 *
 * Fica FORA dos guards porque é um POST servidor-a-servidor da Meta, sem
 * Bearer. A confiança vem do `signed_request` assinado com o App Secret —
 * validado dentro do service.
 *
 * Registrar as URLs no painel:
 *   Threads   → Use cases → Threads API → Settings → Deauthorize callback URL
 *   Instagram → produto Instagram → Deauthorize callback URL
 * Ambas apontam para {APP_URL}/api/v1/channels/{provider}/deauthorize
 */
@ApiTags('Channels')
@Controller('channels')
export class DeauthorizeController {
  private readonly logger = new Logger(DeauthorizeController.name);

  constructor(private readonly service: ChannelsService) {}

  @Post(':provider/deauthorize')
  @ApiExcludeEndpoint()
  async deauthorize(
    @Param('provider') provider: string,
    @Body('signed_request') signedRequest: string,
  ): Promise<{ ok: boolean }> {
    const alvo = provider === 'threads' ? 'threads' : 'instagram';
    try {
      return await this.service.handleDeauthorize(alvo, signedRequest);
    } catch (err: any) {
      // Nunca devolver 5xx: a Meta reenfileira o callback e passaria a bater
      // aqui em loop por causa de um erro nosso.
      this.logger.error(
        `Deauthorize (${alvo}) falhou: ${err?.message ?? err}`,
      );
      return { ok: false };
    }
  }
}
