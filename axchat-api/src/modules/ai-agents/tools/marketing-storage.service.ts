import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';

/**
 * Bucket das mídias que vão para posts do Instagram/Threads.
 *
 * Separado do bucket geral de marketing porque tem regra diferente: a Meta
 * BAIXA a imagem pela URL na hora de publicar ("we cURL your image"), então
 * tudo aqui precisa ser público de leitura. Misturar com material interno
 * seria expor coisa que não deveria ser pública.
 */
export const POSTS_BUCKET = 'imagens-posts-axchat';

export interface StoredObject {
  url: string;
  key: string;
  bucket: string;
}

/**
 * Storage de mídia de marketing no MinIO (S3-compatível) da VPS.
 * Multi-tenant em UM bucket: cada org tem um prefixo (pasta) = slug do nome.
 * O prefixo é criado naturalmente no primeiro upload e reaproveitado depois
 * (S3/MinIO não tem "pasta" real — o prefixo da key é a pasta).
 *
 * Config no env do servidor: MINIO_ENDPOINT, MINIO_ACCESS_KEY,
 * MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_REGION (default us-east-1).
 * Se faltar config, isConfigured() = false e o chamador cai pro storage local.
 */
@Injectable()
export class MarketingStorageService {
  private readonly logger = new Logger(MarketingStorageService.name);
  private readonly client: S3Client | null;
  private readonly endpoint: string;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.endpoint = (config.get<string>('MINIO_ENDPOINT') || '').replace(/\/+$/, '');
    this.bucket = config.get<string>('MINIO_BUCKET') || '';
    const accessKeyId = config.get<string>('MINIO_ACCESS_KEY') || '';
    const secretAccessKey = config.get<string>('MINIO_SECRET_KEY') || '';
    const region = config.get<string>('MINIO_REGION') || 'us-east-1';

    if (this.endpoint && this.bucket && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        endpoint: this.endpoint,
        region,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true, // MinIO usa path-style: endpoint/bucket/key
      });
      this.logger.log(`MinIO configurado: ${this.endpoint}/${this.bucket}`);
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Prefixo (pasta) do tenant: slug legível do NOME + sufixo do orgId.
   * O sufixo (id imutável e único) garante isolamento mesmo se duas orgs
   * tiverem o mesmo nome ou se o nome mudar — sem colidir/compartilhar pasta.
   */
  tenantPrefix(orgName: string, orgId: string): string {
    const slug = (orgName || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const suffix = orgId.slice(0, 8);
    return slug ? `${slug}-${suffix}` : `org-${suffix}`;
  }

  async upload(args: {
    buffer: Buffer;
    key: string; // ex: "<tenant>/abc.png"
    contentType: string;
    /** Sem isso vai pro bucket padrão do marketing. */
    bucket?: string;
  }): Promise<StoredObject> {
    if (!this.client) throw new Error('MinIO não configurado');
    const bucket = args.bucket || this.bucket;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: args.key,
        Body: args.buffer,
        ContentType: args.contentType,
        ACL: 'public-read',
      }),
    );
    return {
      url: `${this.endpoint}/${bucket}/${args.key}`,
      key: args.key,
      bucket,
    };
  }

  /**
   * Garante que o bucket existe e que dá pra LER sem credencial.
   *
   * A política pública é o ponto crítico: a Meta baixa a imagem pela URL na
   * hora de publicar. Só `ACL: public-read` no objeto não basta — o MinIO
   * ignora ACL por padrão e responde 403, e o post falha com uma mensagem que
   * não explica nada. A política de bucket é o que o MinIO respeita.
   *
   * Idempotente: roda a cada upload e não faz nada se já estiver tudo certo.
   */
  async ensurePublicBucket(bucket: string): Promise<void> {
    if (!this.client) throw new Error('MinIO não configurado');

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
      return; // já existe — política foi aplicada na criação
    } catch {
      /* não existe (ou sem permissão de head): tenta criar abaixo */
    }

    try {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
      this.logger.log(`Bucket "${bucket}" criado no MinIO.`);
    } catch (err: any) {
      // Corrida entre duas instâncias criando ao mesmo tempo — tudo bem.
      const nome = err?.name ?? '';
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/.test(nome)) {
        throw err;
      }
    }

    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: bucket,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${bucket}/*`],
            },
          ],
        }),
      }),
    );
    this.logger.log(`Bucket "${bucket}" liberado para leitura pública.`);
  }
}
