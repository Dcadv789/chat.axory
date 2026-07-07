import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { ChannelsService } from './channels.service';
import { WhatsAppHealthService } from './whatsapp-health.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { CoexistenceChannelDto } from './dto/coexistence-channel.dto';
import { InstagramFacebookLoginDto } from './dto/instagram-facebook-login.dto';
import {
  ThreadsPublishDto,
  ThreadsReplyDto,
  ThreadsHideReplyDto,
} from './dto/threads.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentChannelAccess, CurrentOrg, Roles } from '../../../common/decorators';
import type { ChannelAccess } from '../../iam/channel-access/channel-access.service';

@ApiTags('Channels')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly service: ChannelsService,
    private readonly healthService: WhatsAppHealthService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create a new channel. Any member can create — AGENTs are auto-granted access to the channel they create (deny-by-default for everyone else).',
  })
  create(
    @CurrentOrg() org: { id: string; userOrganizationId: string; userRole: OrgRole },
    @Body() dto: CreateChannelDto,
  ) {
    return this.service.create(org.id, dto, {
      userOrganizationId: org.userOrganizationId,
      role: org.userRole,
    });
  }

  @Get('integrations/coexistence')
  @ApiOperation({
    summary:
      'Public coexistence config for the org popup (appId + configId, no secret). enabled=false if not set up by super admin.',
  })
  getCoexistenceConfig() {
    return this.service.getCoexistenceConfig();
  }

  @Post('whatsapp/coexistence')
  @ApiOperation({
    summary:
      'Create a WhatsApp Official channel via Coexistence (Embedded Signup). Exchanges the popup code for an access token server-side.',
  })
  createCoexistence(
    @CurrentOrg() org: { id: string; userOrganizationId: string; userRole: OrgRole },
    @Body() dto: CoexistenceChannelDto,
  ) {
    return this.service.createFromCoexistence(org.id, dto, {
      userOrganizationId: org.userOrganizationId,
      role: org.userRole,
    });
  }

  @Post('whatsapp/embedded-signup')
  @ApiOperation({
    summary:
      'Cria um WhatsApp Official via Embedded Signup (Facebook Login): troca o code por token e puxa os dados do número.',
  })
  createEmbeddedSignup(
    @CurrentOrg() org: { id: string; userOrganizationId: string; userRole: OrgRole },
    @Body() dto: CoexistenceChannelDto,
  ) {
    return this.service.createFromEmbeddedSignup(org.id, dto, {
      userOrganizationId: org.userOrganizationId,
      role: org.userRole,
    });
  }

  @Post('instagram/facebook-login')
  @ApiOperation({
    summary:
      'Cria um canal Instagram via Facebook Login for Business: troca o code do popup por token, acha a Página + conta IG vinculada e configura o canal automaticamente.',
  })
  createInstagramFacebookLogin(
    @CurrentOrg() org: { id: string; userOrganizationId: string; userRole: OrgRole },
    @Body() dto: InstagramFacebookLoginDto,
  ) {
    return this.service.createFromInstagramFacebookLogin(org.id, dto, {
      userOrganizationId: org.userOrganizationId,
      role: org.userRole,
    });
  }

  @Post('instagram/facebook-login/debug')
  @ApiOperation({
    summary:
      'DEBUG: troca o code do popup e devolve os dados brutos da Meta (debug_token, /me/accounts, /me/businesses, permissões) sem criar canal.',
  })
  debugInstagramFacebookLogin(
    @CurrentOrg('id') orgId: string,
    @Body() dto: InstagramFacebookLoginDto,
  ) {
    return this.service.debugInstagramFacebookLogin(orgId, dto.code);
  }

  @Get('threads/oauth/url')
  @ApiOperation({
    summary:
      'Monta a URL de autorização do Threads (OAuth). O front redireciona o navegador pra ela; o retorno cai no callback público.',
  })
  getThreadsAuthUrl(
    @CurrentOrg() org: { id: string; userOrganizationId: string; userRole: OrgRole },
    @Query('name') name: string,
    @Query('visibility') visibility?: 'ORG' | 'PRIVATE',
  ) {
    return this.service.getThreadsAuthUrl(
      org.id,
      { userOrganizationId: org.userOrganizationId, role: org.userRole },
      name,
      visibility,
    );
  }

  @Post(':id/threads/publish')
  @ApiOperation({ summary: 'Publica um post no Threads (texto/imagem/vídeo/carrossel)' })
  threadsPublish(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Body() dto: ThreadsPublishDto,
  ) {
    return this.service.threadsPublish(id, orgId, dto);
  }

  @Get(':id/threads/replies')
  @ApiOperation({ summary: 'Lista as respostas de um post do Threads' })
  threadsReplies(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Query('mediaId') mediaId: string,
  ) {
    return this.service.threadsReplies(id, orgId, mediaId);
  }

  @Post(':id/threads/reply')
  @ApiOperation({ summary: 'Responde um post/resposta no Threads' })
  threadsReply(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Body() dto: ThreadsReplyDto,
  ) {
    return this.service.threadsReply(id, orgId, dto.replyToId, dto.text);
  }

  @Post(':id/threads/hide-reply')
  @ApiOperation({ summary: 'Oculta/reexibe uma resposta no Threads (moderação)' })
  threadsHideReply(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Body() dto: ThreadsHideReplyDto,
  ) {
    return this.service.threadsHideReply(id, orgId, dto.replyId, dto.hide);
  }

  @Get(':id/threads/insights')
  @ApiOperation({ summary: 'Insights de um post (mediaId) ou do perfil (sem mediaId)' })
  threadsInsights(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Query('mediaId') mediaId?: string,
  ) {
    return this.service.threadsInsights(id, orgId, mediaId);
  }

  @Get()
  findAll(
    @CurrentOrg('id') orgId: string,
    @CurrentChannelAccess() access: ChannelAccess,
  ) {
    return this.service.findAll(orgId, access);
  }

  @Get(':id/webhook-diagnostics')
  @ApiOperation({
    summary:
      'Diagnóstico: últimos webhooks recebidos, entry.id que veio e se casou com o canal',
  })
  webhookDiagnostics(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.webhookDiagnostics(id, orgId);
  }

  @Post(':id/instagram-subscribe')
  @ApiOperation({
    summary: 'Inscreve o app nos webhooks (DMs+comentários) da conta IG do canal',
  })
  instagramSubscribe(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.instagramSubscribe(id, orgId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get channel by ID' })
  findOne(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @CurrentChannelAccess() access: ChannelAccess,
  ) {
    return this.service.findOne(id, orgId, access);
  }

  @Patch(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update a channel' })
  update(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @CurrentOrg('userOrganizationId') userOrganizationId: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return this.service.update(id, orgId, dto, userOrganizationId);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Soft-delete a channel. Requires ?confirmName=<exact channel name>.',
  })
  remove(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @Query('confirmName') confirmName?: string,
  ) {
    return this.service.remove(id, orgId, confirmName);
  }

  @Post(':id/sync')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Sync channel — import chats, contacts, and messages from provider' })
  syncChannel(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.syncChannel(id, orgId);
  }

  @Get(':id/sync/status')
  @ApiOperation({ summary: 'Get latest sync job status for a channel' })
  getSyncStatus(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.getSyncStatus(id, orgId);
  }

  @Post(':id/sync/cancel')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cancel active sync for a channel' })
  cancelSync(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.cancelSync(id, orgId);
  }

  @Post(':id/test')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Test channel connection' })
  testConnection(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.testConnection(id, orgId);
  }

  @Get(':id/whatsapp-health')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Get WhatsApp health status — phone number, quality rating, business name, webhook status.',
  })
  async getWhatsAppHealth(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @CurrentChannelAccess() access: ChannelAccess,
  ) {
    const channel = await this.service.findOne(id, orgId, access);
    if (channel.type !== 'WHATSAPP_OFFICIAL') {
      throw new NotFoundException('Health check disponível apenas para canais WhatsApp Official');
    }
    return this.healthService.getHealth((channel.config ?? {}) as Record<string, any>);
  }
}
