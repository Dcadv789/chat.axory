import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness probe for Coolify/Docker healthcheck' })
  check() {
    return {
      status: 'ok',
      service: 'axchat-api',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({
    summary:
      'Readiness probe: checa dependências (banco). Retorna 503 se o banco não responder — assim o orquestrador não mantém em rotação instância com dependência fora.',
  })
  async ready() {
    const checks: Record<string, 'ok' | 'down'> = { database: 'down' };
    let healthy = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      healthy = false;
    }
    if (!healthy) {
      // 503 → readiness falhou.
      throw new ServiceUnavailableException({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks, timestamp: new Date().toISOString() };
  }
}
