import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ScheduledPostNetwork,
  ScheduledPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { MarketingPublishService } from './marketing-publish.service';

/** Um post não pode ser marcado pra menos de um minuto à frente. */
const ANTECEDENCIA_MINIMA_MS = 60_000;
/** Nem pra depois de um ano — quase sempre é erro de digitação no ano. */
const HORIZONTE_MAXIMO_MS = 365 * 24 * 60 * 60 * 1000;
/**
 * Publicar não tem desfazer. Duas tentativas cobrem a instabilidade normal da
 * Meta; insistir mais arrisca o pior caso, que é o post sair duas vezes.
 */
const MAX_TENTATIVAS = 2;
/**
 * Um item preso em PUBLISHING por mais que isto é resto de processo morto —
 * a publicação em si (com vídeo) leva no máximo ~60s.
 */
const LEASE_MS = 10 * 60_000;

export interface CriarAgendamento {
  network: ScheduledPostNetwork;
  scheduledFor: string;
  caption?: string;
  imageUrl?: string;
  videoUrl?: string;
  carouselUrls?: string[];
  channelId?: string;
}

@Injectable()
export class MarketingScheduleService {
  private readonly logger = new Logger(MarketingScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publish: MarketingPublishService,
  ) {}

  /**
   * Agendamentos num intervalo. A tela pede o mês visível — devolver tudo
   * cresceria sem limite conforme a empresa usa.
   */
  async listar(orgId: string, since?: string, until?: string) {
    const where: Prisma.ScheduledPostWhereInput = { organizationId: orgId };
    if (since || until) {
      where.scheduledFor = {
        ...(since ? { gte: new Date(since) } : {}),
        ...(until ? { lte: new Date(until) } : {}),
      };
    }
    const posts = await this.prisma.scheduledPost.findMany({
      where,
      orderBy: { scheduledFor: 'asc' },
      take: 500,
    });
    return { posts };
  }

  async criar(orgId: string, userId: string | undefined, dto: CriarAgendamento) {
    const quando = new Date(dto.scheduledFor);
    if (Number.isNaN(quando.getTime())) {
      throw new BadRequestException('Data do agendamento inválida.');
    }
    const agora = Date.now();
    if (quando.getTime() < agora + ANTECEDENCIA_MINIMA_MS) {
      throw new BadRequestException(
        'Escolha um horário pelo menos um minuto à frente.',
      );
    }
    if (quando.getTime() > agora + HORIZONTE_MAXIMO_MS) {
      throw new BadRequestException(
        'Agendamento no máximo um ano à frente. Confira o ano da data.',
      );
    }

    const carrossel = (dto.carouselUrls ?? []).map((u) => u.trim()).filter(Boolean);
    this.validarConteudo(dto, carrossel);

    return this.prisma.scheduledPost.create({
      data: {
        organizationId: orgId,
        channelId: dto.channelId ?? null,
        network: dto.network,
        caption: dto.caption?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        videoUrl: dto.videoUrl?.trim() || null,
        carouselUrls: carrossel,
        scheduledFor: quando,
        createdById: userId ?? null,
      },
    });
  }

  /**
   * Só mexe no horário, e só enquanto está pendente. Reescrever o conteúdo de
   * um post que já saiu (ou está saindo) não faria nada no Instagram e daria a
   * impressão contrária.
   */
  async reagendar(orgId: string, id: string, scheduledFor: string) {
    const quando = new Date(scheduledFor);
    if (Number.isNaN(quando.getTime())) {
      throw new BadRequestException('Data do agendamento inválida.');
    }
    if (quando.getTime() < Date.now() + ANTECEDENCIA_MINIMA_MS) {
      throw new BadRequestException(
        'Escolha um horário pelo menos um minuto à frente.',
      );
    }
    const alterados = await this.prisma.scheduledPost.updateMany({
      where: { id, organizationId: orgId, status: ScheduledPostStatus.PENDING },
      data: { scheduledFor: quando },
    });
    if (alterados.count === 0) {
      throw new NotFoundException(
        'Agendamento não encontrado ou já publicado — só dá pra remarcar o que ainda está pendente.',
      );
    }
    return this.prisma.scheduledPost.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  /** Cancela um agendamento pendente. Mantém a linha, pro histórico. */
  async cancelar(orgId: string, id: string) {
    const alterados = await this.prisma.scheduledPost.updateMany({
      where: { id, organizationId: orgId, status: ScheduledPostStatus.PENDING },
      data: { status: ScheduledPostStatus.CANCELED },
    });
    if (alterados.count === 0) {
      throw new NotFoundException(
        'Agendamento não encontrado ou já publicado — só dá pra cancelar o que ainda está pendente.',
      );
    }
    return { ok: true };
  }

  /** Some com a linha de vez. Só o que não está pendente nem publicando. */
  async remover(orgId: string, id: string) {
    const apagados = await this.prisma.scheduledPost.deleteMany({
      where: {
        id,
        organizationId: orgId,
        status: {
          in: [
            ScheduledPostStatus.CANCELED,
            ScheduledPostStatus.FAILED,
            ScheduledPostStatus.PUBLISHED,
          ],
        },
      },
    });
    if (apagados.count === 0) {
      throw new NotFoundException(
        'Só dá pra remover agendamento já finalizado. Cancele antes.',
      );
    }
    return { ok: true };
  }

  /**
   * Publica tudo que venceu. Chamado pelo tick de um minuto.
   *
   * Cada item é reivindicado com um `updateMany` condicionado ao status — quem
   * conseguir mudar PENDING→PUBLISHING é o dono da publicação. Sem isso, duas
   * instâncias da API pegariam o mesmo post e ele sairia duas vezes no perfil
   * do cliente, o que não tem desfazer.
   */
  async publicarVencidos(): Promise<{ publicados: number; falhas: number }> {
    await this.liberarPresos();

    const vencidos = await this.prisma.scheduledPost.findMany({
      where: {
        status: ScheduledPostStatus.PENDING,
        scheduledFor: { lte: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
      take: 25,
      select: { id: true },
    });

    let publicados = 0;
    let falhas = 0;
    for (const { id } of vencidos) {
      const resultado = await this.publicarUm(id);
      if (resultado === 'publicado') publicados++;
      else if (resultado === 'falhou') falhas++;
    }
    return { publicados, falhas };
  }

  private async publicarUm(
    id: string,
  ): Promise<'publicado' | 'falhou' | 'ignorado'> {
    const reivindicado = await this.prisma.scheduledPost.updateMany({
      where: { id, status: ScheduledPostStatus.PENDING },
      data: { status: ScheduledPostStatus.PUBLISHING, updatedAt: new Date() },
    });
    if (reivindicado.count === 0) return 'ignorado';

    const post = await this.prisma.scheduledPost.findUnique({ where: { id } });
    if (!post) return 'ignorado';

    try {
      const mediaId =
        post.network === ScheduledPostNetwork.THREADS
          ? (
              await this.publish.publishThreads(post.organizationId, {
                // Mesma derivação do endpoint de publicação direta: o painel
                // manda texto + mídia opcional, o tipo sai do que veio.
                mediaType: post.videoUrl
                  ? 'VIDEO'
                  : post.imageUrl
                    ? 'IMAGE'
                    : 'TEXT',
                text: post.caption ?? '',
                imageUrl: post.imageUrl ?? undefined,
                videoUrl: post.videoUrl ?? undefined,
              })
            ).postId
          : (
              await this.publish.publishInstagram(post.organizationId, {
                caption: post.caption ?? undefined,
                imageUrl: post.imageUrl ?? undefined,
                videoUrl: post.videoUrl ?? undefined,
                carouselUrls: post.carouselUrls.length
                  ? post.carouselUrls
                  : undefined,
                channelId: post.channelId ?? undefined,
              })
            ).mediaId;

      await this.prisma.scheduledPost.update({
        where: { id },
        data: {
          status: ScheduledPostStatus.PUBLISHED,
          publishedAt: new Date(),
          publishedMediaId: mediaId,
          lastError: null,
        },
      });
      this.logger.log(`Agendamento ${id} publicado (${post.network}) — ${mediaId}`);
      return 'publicado';
    } catch (err: any) {
      const motivo = String(err?.message ?? err).slice(0, 500);
      const tentativas = post.attempts + 1;
      // Volta pra PENDING enquanto houver tentativa; o próximo tick reprocessa.
      const desiste = tentativas >= MAX_TENTATIVAS;
      await this.prisma.scheduledPost.update({
        where: { id },
        data: {
          status: desiste
            ? ScheduledPostStatus.FAILED
            : ScheduledPostStatus.PENDING,
          attempts: tentativas,
          lastError: motivo,
        },
      });
      this.logger.warn(
        `Agendamento ${id} falhou (tentativa ${tentativas}/${MAX_TENTATIVAS}): ${motivo}`,
      );
      return desiste ? 'falhou' : 'ignorado';
    }
  }

  /**
   * Devolve pra fila o que ficou preso em PUBLISHING além do lease — deploy no
   * meio de uma publicação deixaria o post travado nesse estado pra sempre.
   */
  private async liberarPresos() {
    const limite = new Date(Date.now() - LEASE_MS);
    const soltos = await this.prisma.scheduledPost.updateMany({
      where: { status: ScheduledPostStatus.PUBLISHING, updatedAt: { lt: limite } },
      data: { status: ScheduledPostStatus.PENDING },
    });
    if (soltos.count > 0) {
      this.logger.warn(
        `${soltos.count} agendamento(s) presos em PUBLISHING voltaram pra fila.`,
      );
    }
  }

  private validarConteudo(dto: CriarAgendamento, carrossel: string[]) {
    if (dto.network === ScheduledPostNetwork.THREADS) {
      if (!dto.caption?.trim() && !dto.imageUrl?.trim() && !dto.videoUrl?.trim()) {
        throw new BadRequestException(
          'Um post do Threads precisa de texto, imagem ou vídeo.',
        );
      }
      return;
    }
    if (carrossel.length > 0) {
      if (carrossel.length < 2 || carrossel.length > 10) {
        throw new BadRequestException('Um carrossel tem de 2 a 10 itens.');
      }
      return;
    }
    if (!dto.imageUrl?.trim() && !dto.videoUrl?.trim()) {
      throw new BadRequestException(
        'Um post do Instagram precisa de uma imagem ou vídeo.',
      );
    }
  }
}
