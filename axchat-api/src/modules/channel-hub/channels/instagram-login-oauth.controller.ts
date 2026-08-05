import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { ChannelsService } from './channels.service';

/**
 * Callback do OAuth do **Login do Instagram** (conta do próprio Instagram, sem
 * Página do Facebook).
 *
 * Fica FORA dos guards porque é um redirect do navegador vindo da Meta — não
 * carrega Bearer token. A confiança vem do `state` assinado (HMAC), que carrega
 * org + criador. Ao terminar, devolve o navegador pro app web.
 */
@ApiTags('Channels')
@Controller('channels/instagram-login/oauth')
export class InstagramLoginOAuthController {
  private readonly logger = new Logger(InstagramLoginOAuthController.name);

  constructor(private readonly service: ChannelsService) {}

  @Get('callback')
  @ApiExcludeEndpoint()
  @ApiOperation({
    summary: 'Instagram Login OAuth callback (público — valida via state assinado)',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const webBase = (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')[0]
      .trim();
    // `/settings/channels` — sem `/dashboard`: o route group `(dashboard)` do
    // Next NÃO entra na URL. O callback do Threads apontava pro caminho com
    // `/dashboard` e caía em 404 depois de conectar.
    const dest = (params: string) => `${webBase}/settings/channels?${params}`;

    if (error) {
      this.logger.warn(`Instagram Login OAuth error: ${error} — ${errorDescription}`);
      return res.redirect(
        dest(`instagram=error&reason=${encodeURIComponent(errorDescription || error)}`),
      );
    }

    try {
      const channel = await this.service.createFromInstagramLoginCallback(code, state);
      return res.redirect(
        dest(`instagram=connected&name=${encodeURIComponent(channel.name)}`),
      );
    } catch (err: any) {
      this.logger.error(`Instagram Login callback failed: ${err?.message ?? err}`);
      return res.redirect(
        dest(
          `instagram=error&reason=${encodeURIComponent(err?.message ?? 'falha ao conectar')}`,
        ),
      );
    }
  }
}
