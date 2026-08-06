import { Injectable, Logger } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ThreadsHttpClient } from '../adapters/threads/threads.http-client';
import { InstagramLoginHttpClient } from '../adapters/instagram/instagram-login.http-client';

/**
 * Quanto antes do vencimento a gente renova. Os tokens longos da Meta valem 60
 * dias; renovar com 10 de folga dá margem pra API estar fora do ar por alguns
 * dias sem o canal morrer.
 */
const FOLGA_DIAS = 10;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Renova os tokens de longa duração antes de expirarem.
 *
 * Threads e Login do Instagram entregam token de 60 dias e exigem renovação
 * explícita. Os métodos de refresh já existiam nos clients desde que os canais
 * foram criados, mas ninguém os chamava: na prática todo canal desses morria
 * sozinho em 60 dias, e o dono só descobria quando parava de funcionar.
 */
@Injectable()
export class ChannelTokenRefreshService {
  private readonly logger = new Logger(ChannelTokenRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly threads: ThreadsHttpClient,
    private readonly instagramLogin: InstagramLoginHttpClient,
  ) {}

  async refreshExpiringTokens(): Promise<{ renovados: number; falhas: number }> {
    // São poucos canais desse tipo por instalação, e `tokenExpiresAt` vive
    // dentro do JSON de config — filtrar em memória sai mais simples e claro
    // do que montar um filtro de data sobre JSON no Prisma.
    const canais = await this.prisma.channel.findMany({
      where: {
        type: { in: [ChannelType.THREADS, ChannelType.INSTAGRAM] },
        deletedAt: null,
        isActive: true,
      },
    });

    const limite = Date.now() + FOLGA_DIAS * DIA_MS;
    let renovados = 0;
    let falhas = 0;

    for (const canal of canais) {
      const config = (canal.config ?? {}) as Record<string, any>;
      const expiraEm = config.tokenExpiresAt
        ? new Date(config.tokenExpiresAt).getTime()
        : NaN;

      // Sem data de expiração não há o que renovar: é o caso do Facebook Login
      // for Business, cujo token não expira enquanto o acesso não for revogado.
      if (Number.isNaN(expiraEm) || expiraEm > limite) continue;

      try {
        const novo = await this.renovar(canal.type, config);
        if (!novo) continue;

        await this.prisma.channel.update({
          where: { id: canal.id },
          data: {
            config: {
              ...config,
              accessToken: novo.accessToken,
              tokenExpiresAt: new Date(
                Date.now() + novo.expiresIn * 1000,
              ).toISOString(),
            },
          },
        });
        renovados++;
        this.logger.log(
          `Token do canal ${canal.id} (${canal.type}) renovado por mais ${Math.round(novo.expiresIn / 86400)} dias.`,
        );
      } catch (err: any) {
        falhas++;
        this.logger.error(
          `Falha ao renovar o token do canal ${canal.id} (${canal.type}): ${err?.message ?? err}`,
        );
        // Não desativa o canal: a falha pode ser instabilidade da Meta, e
        // ainda há dias de folga até o vencimento pra tentar de novo.
      }
    }

    return { renovados, falhas };
  }

  private async renovar(
    tipo: ChannelType,
    config: Record<string, any>,
  ): Promise<{ accessToken: string; expiresIn: number } | null> {
    const token = String(config.accessToken ?? '').trim();
    if (!token) return null;

    if (tipo === ChannelType.THREADS) {
      return this.threads.refreshLongLivedToken(token);
    }
    // Instagram: só o fluxo de Login do Instagram (graph.instagram.com) tem
    // token renovável. O modo Facebook nem chega aqui, por não ter expiração.
    if (config.graphApi === 'instagram') {
      return this.instagramLogin.refreshLongLivedToken(token);
    }
    return null;
  }
}
