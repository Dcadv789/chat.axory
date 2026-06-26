import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

  /** slug do nome da org pra usar como prefixo (pasta do tenant). */
  tenantPrefix(orgName: string, orgId: string): string {
    const slug = (orgName || '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || `org-${orgId.slice(0, 8)}`;
  }

  async upload(args: {
    buffer: Buffer;
    key: string; // ex: "<tenant>/abc.png"
    contentType: string;
  }): Promise<StoredObject> {
    if (!this.client) throw new Error('MinIO não configurado');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: args.key,
        Body: args.buffer,
        ContentType: args.contentType,
        ACL: 'public-read',
      }),
    );
    return {
      url: `${this.endpoint}/${this.bucket}/${args.key}`,
      key: args.key,
      bucket: this.bucket,
    };
  }
}
