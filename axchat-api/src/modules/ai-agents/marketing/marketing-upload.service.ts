import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../database/prisma.service';
import {
  MarketingStorageService,
  POSTS_BUCKET,
} from '../tools/marketing-storage.service';

/**
 * A Meta só aceita JPEG em post de imagem, mas o usuário manda o que tem —
 * print em PNG, foto do celular em HEIC. Com o imgproxy configurado a gente
 * aceita tudo e converte na entrega da URL; sem ele, sobra exigir JPEG.
 */
const TIPOS_IMAGEM = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/avif',
];
const TIPOS_VIDEO = ['video/mp4', 'video/quicktime'];

/**
 * Como o imgproxy entrega a imagem pra Meta.
 *
 * `rs:fit:1440:1800` — 1440 é a largura máxima que o Instagram usa, e 1800 é a
 * altura de um 4:5 (o formato mais alto que ele aceita) nessa largura. `fit`
 * preserva a proporção e NÃO amplia, então imagem pequena passa intacta.
 *
 * `q:90` porque o Instagram recomprime tudo de novo: acima disso só engorda o
 * arquivo sem diferença visível no feed.
 */
const IMGPROXY_PROCESSO = 'rs:fit:1440:1800/q:90';

const MAX_IMAGEM = 25 * 1024 * 1024; // o imgproxy encolhe; o teto aqui é de sanidade
const MAX_IMAGEM_SEM_PROXY = 8 * 1024 * 1024; // limite da Meta, quando vai direto
const MAX_VIDEO = 100 * 1024 * 1024;

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

  private readonly imgproxy: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MarketingStorageService,
    config: ConfigService,
  ) {
    this.imgproxy = (config.get<string>('IMGPROXY_URL') || '').replace(/\/+$/, '');
  }

  /**
   * URL que vai pra Meta. Com imgproxy, entrega JPEG redimensionado a partir de
   * qualquer formato — resolve o "só JPEG" e de quebra derruba o peso (um PNG
   * de 2,3 MB sai com ~300 KB).
   *
   * Sem imgproxy configurado, devolve a URL crua: o arquivo já é JPEG, porque
   * a validação de formato exigiu isso na entrada.
   */
  private urlParaMeta(urlOriginal: string): string {
    if (!this.imgproxy) return urlOriginal;
    // Modo `insecure` (sem assinatura) e `plain` — nossas keys são
    // uuid+extensão, sem query string nem caractere que precise de escape.
    return `${this.imgproxy}/insecure/${IMGPROXY_PROCESSO}/plain/${urlOriginal}@jpg`;
  }

  async uploadPostMedia(
    orgId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ): Promise<{ url: string; urlOriginal: string; tipo: 'imagem' | 'video' }> {
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
        'Formato não suportado. Envie uma imagem (JPG, PNG, WEBP, HEIC) ou vídeo MP4.',
      );
    }

    // Sem imgproxy não há conversão: o arquivo vai cru pra Meta, que só lê
    // JPEG. Melhor recusar aqui, com o motivo, do que na hora de publicar.
    const ehJpeg = mime === 'image/jpeg' || mime === 'image/jpg';
    if (ehImagem && !ehJpeg && !this.imgproxy) {
      throw new BadRequestException(
        'O Instagram só aceita JPEG e a conversão automática não está ativa neste servidor (IMGPROXY_URL). Converta o arquivo para .jpg e envie de novo.',
      );
    }

    const teto = ehVideo
      ? MAX_VIDEO
      : this.imgproxy
        ? MAX_IMAGEM
        : MAX_IMAGEM_SEM_PROXY;
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
    const extensao = ehVideo
      ? mime === 'video/quicktime'
        ? 'mov'
        : 'mp4'
      : // A extensão precisa refletir o arquivo REAL: é ela que define o
        // Content-Type servido, e o imgproxy decide o decoder a partir dele.
        (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    // UUID no nome: dois uploads do mesmo arquivo não podem se sobrescrever, e
    // o nome original pode ter acento/espaço que quebra a URL.
    const key = `${prefixo}/${Date.now()}-${randomUUID().slice(0, 8)}.${extensao}`;

    const objeto = await this.storage.upload({
      buffer: file.buffer,
      key,
      contentType: mime,
      bucket: POSTS_BUCKET,
    });

    // Vídeo o imgproxy não processa — vai direto do storage.
    const url = ehImagem ? this.urlParaMeta(objeto.url) : objeto.url;

    this.logger.log(`Mídia de post enviada: ${objeto.url} (org ${orgId})`);
    return {
      url,
      urlOriginal: objeto.url,
      tipo: ehImagem ? 'imagem' : 'video',
    };
  }
}
