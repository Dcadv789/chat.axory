import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  MarketingStorageService,
  POSTS_BUCKET,
} from '../tools/marketing-storage.service';

/**
 * A Meta só aceita JPEG em post de imagem. PNG passa no upload e quebra depois,
 * na publicação, com um erro que não fala de formato — então barramos aqui,
 * onde ainda dá pra explicar.
 */
const TIPOS_IMAGEM = ['image/jpeg', 'image/jpg'];
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime'];

const MAX_IMAGEM = 8 * 1024 * 1024; // 8 MB — limite da Meta pra imagem
const MAX_VIDEO = 100 * 1024 * 1024; // 100 MB

/**
 * Upload das mídias que vão para posts.
 *
 * Existe porque o usuário comum não tem URL pública de nada: ele tem o arquivo
 * no computador. A gente guarda no MinIO num bucket público e devolve a URL
 * que a Meta consegue baixar na hora de publicar.
 */
@Injectable()
export class MarketingUploadService {
  private readonly logger = new Logger(MarketingUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MarketingStorageService,
  ) {}

  async uploadPostMedia(
    orgId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<{ url: string; tipo: 'imagem' | 'video' }> {
    if (!this.storage.isConfigured()) {
      throw new BadRequestException(
        'Armazenamento de mídia não configurado no servidor (MINIO_*). Fale com o suporte.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo vazio.');
    }

    const mime = (file.mimetype || '').toLowerCase();
    const ehImagem = TIPOS_IMAGEM.includes(mime);
    const ehVideo = TIPOS_VIDEO.includes(mime);

    if (!ehImagem && !ehVideo) {
      throw new BadRequestException(
        mime.startsWith('image/')
          ? 'O Instagram só aceita JPEG em post de imagem. Converta o arquivo para .jpg e envie de novo.'
          : 'Formato não suportado. Envie imagem JPEG ou vídeo MP4.',
      );
    }

    const teto = ehImagem ? MAX_IMAGEM : MAX_VIDEO;
    if (file.size > teto) {
      throw new BadRequestException(
        `Arquivo grande demais (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é ${teto / 1024 / 1024} MB.`,
      );
    }

    await this.storage.ensurePublicBucket(POSTS_BUCKET);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    const prefixo = this.storage.tenantPrefix(org?.name ?? '', orgId);
    const extensao = ehImagem ? 'jpg' : mime === 'video/quicktime' ? 'mov' : 'mp4';
    // UUID no nome: dois uploads do mesmo arquivo não podem se sobrescrever, e
    // o nome original pode ter acento/espaço que quebra a URL.
    const key = `${prefixo}/${Date.now()}-${randomUUID().slice(0, 8)}.${extensao}`;

    const objeto = await this.storage.upload({
      buffer: file.buffer,
      key,
      contentType: mime,
      bucket: POSTS_BUCKET,
    });

    this.logger.log(`Mídia de post enviada: ${objeto.url} (org ${orgId})`);
    return { url: objeto.url, tipo: ehImagem ? 'imagem' : 'video' };
  }
}
