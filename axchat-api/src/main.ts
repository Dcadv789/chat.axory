import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppLogger } from './common/logger/app-logger';
import { requestContext } from './common/context/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  // Logger com correlation-id automático (lê o requestId do AsyncLocalStorage).
  app.useLogger(new AppLogger());
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // helmet blocks cross-origin media by default; relax that for <audio>/<img>
  // tags served by this API (same origin, but browsers enforce CORP).
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Correlation-id: abre um AsyncLocalStorage por request, reaproveitando o
  // x-request-id do proxy (ou gerando um). Tudo que rodar abaixo daqui — todas
  // as linhas de log — sai carimbado com o mesmo id.
  app.use((req: any, res: any, next: () => void) => {
    const incoming = req.headers?.['x-request-id'];
    const requestId =
      (typeof incoming === 'string' && incoming) || randomUUID();
    req.requestId = requestId;
    res.setHeader?.('x-request-id', requestId);
    requestContext.run({ requestId }, () => next());
  });

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Serve locally-stored user uploads (audio, etc.) before the global prefix
  // kicks in. This is set up pre-prefix so the path matches both in dev and
  // behind the reverse-proxy.
  const uploadsDir = path.resolve(
    config.get<string>('UPLOADS_DIR') || path.join(process.cwd(), 'uploads'),
  );
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const corsOriginRaw = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');
  const corsOrigins = corsOriginRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const applyUploadCors = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const origin = req.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (corsOrigins.length === 1) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigins[0]);
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(204).end();
      return;
    }
    next();
  };

  // CORS must run before express.static — otherwise static responses skip headers.
  app.use('/api/v1/uploads', applyUploadCors);
  app.use(
    '/api/v1/uploads',
    express.static(uploadsDir, {
      maxAge: '30d',
      fallthrough: false,
      index: false,
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());

  const swagger = new DocumentBuilder()
    .setTitle('AxChat API')
    .setDescription('Omnichannel customer service API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
