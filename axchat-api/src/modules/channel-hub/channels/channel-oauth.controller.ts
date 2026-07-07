import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { ChannelsService } from './channels.service';

/**
 * Callbacks de OAuth por REDIRECT (Threads e Business Login for Instagram).
 * Ficam FORA dos guards (JwtAuthGuard) porque são redirects do navegador vindos
 * da Meta — sem Bearer token. A confiança vem do `state` assinado (HMAC) que
 * carrega org + criador. Ao terminar, redireciona o navegador de volta pro app.
 */
@ApiTags('Channels')
@Controller('channels')
export class ChannelOAuthController {
  private readonly logger = new Logger(ChannelOAuthController.name);

  constructor(private readonly service: ChannelsService) {}

  private webDest(params: string): string {
    const webBase = (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')[0]
      .trim();
    return `${webBase}/dashboard/settings/channels?${params}`;
  }

  @Get('threads/oauth/callback')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Threads OAuth redirect callback (público — valida via state assinado)' })
  async threadsCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    if (error) {
      this.logger.warn(`Threads OAuth error: ${error} — ${errorDescription}`);
      return res.redirect(
        this.webDest(`threads=error&reason=${encodeURIComponent(errorDescription || error)}`),
      );
    }
    try {
      const channel = await this.service.createFromThreadsCallback(code, state);
      return res.redirect(
        this.webDest(`threads=connected&name=${encodeURIComponent(channel.name)}`),
      );
    } catch (err: any) {
      this.logger.error(`Threads callback failed: ${err?.message ?? err}`);
      return res.redirect(
        this.webDest(`threads=error&reason=${encodeURIComponent(err?.message ?? 'falha ao conectar')}`),
      );
    }
  }

  @Get('instagram/login/callback')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Business Login for Instagram callback (público — valida via state assinado)' })
  async instagramLoginCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    if (error) {
      this.logger.warn(`Instagram Login OAuth error: ${error} — ${errorDescription}`);
      return res.redirect(
        this.webDest(`instagram=error&reason=${encodeURIComponent(errorDescription || error)}`),
      );
    }
    try {
      const channel = await this.service.createFromInstagramLoginCallback(code, state);
      return res.redirect(
        this.webDest(`instagram=connected&name=${encodeURIComponent(channel.name)}`),
      );
    } catch (err: any) {
      this.logger.error(`Instagram Login callback failed: ${err?.message ?? err}`);
      return res.redirect(
        this.webDest(`instagram=error&reason=${encodeURIComponent(err?.message ?? 'falha ao conectar')}`),
      );
    }
  }
}
