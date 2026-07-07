import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { ChannelsService } from './channels.service';

/**
 * Callback do OAuth do Threads. Fica FORA dos guards (JwtAuthGuard) porque é um
 * redirect do navegador vindo da Meta — não carrega o Bearer token. A confiança
 * vem do `state` assinado (HMAC) que carrega org + criador. Ao terminar, redireciona
 * o navegador de volta pro app web.
 */
@ApiTags('Channels')
@Controller('channels/threads/oauth')
export class ThreadsOAuthController {
  private readonly logger = new Logger(ThreadsOAuthController.name);

  constructor(private readonly service: ChannelsService) {}

  @Get('callback')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Threads OAuth redirect callback (público — valida via state assinado)' })
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
    const dest = (params: string) =>
      `${webBase}/dashboard/settings/channels?${params}`;

    if (error) {
      this.logger.warn(`Threads OAuth error: ${error} — ${errorDescription}`);
      return res.redirect(
        dest(`threads=error&reason=${encodeURIComponent(errorDescription || error)}`),
      );
    }

    try {
      const channel = await this.service.createFromThreadsCallback(code, state);
      return res.redirect(
        dest(`threads=connected&name=${encodeURIComponent(channel.name)}`),
      );
    } catch (err: any) {
      this.logger.error(`Threads callback failed: ${err?.message ?? err}`);
      return res.redirect(
        dest(`threads=error&reason=${encodeURIComponent(err?.message ?? 'falha ao conectar')}`),
      );
    }
  }
}
