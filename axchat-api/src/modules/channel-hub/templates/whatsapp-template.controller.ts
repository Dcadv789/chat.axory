import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, OrgGuard } from '../../../common/guards';
import { PrismaService } from '../../../database/prisma.service';
import { WhatsappTemplateService } from './whatsapp-template.service';

@ApiTags('WhatsApp Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('channels/:channelId/whatsapp-templates')
export class WhatsappTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: WhatsappTemplateService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar templates salvos localmente' })
  async list(@Param('channelId') channelId: string) {
    return { data: await this.templateService.listByChannel(channelId) };
  }

  @Post('sync')
  @ApiOperation({
    summary:
      'Sincronizar templates da Meta Cloud API para o banco local',
  })
  async sync(@Param('channelId') channelId: string) {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Canal nao encontrado');
    if (channel.type !== 'WHATSAPP_OFFICIAL') {
      throw new BadRequestException(
        'Sincronizacao de templates disponivel apenas para canais WhatsApp Official',
      );
    }
    const result = await this.templateService.syncFromMeta(channel);
    return { data: result };
  }
}
