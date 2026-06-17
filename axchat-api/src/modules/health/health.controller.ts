import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

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
}
