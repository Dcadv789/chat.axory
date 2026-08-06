import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { MarketingProfileService } from './marketing-profile.service';
import { MarketingAdsService } from './marketing-ads.service';
import { MarketingCredentialsService } from './marketing-credentials.service';
import { MarketingPublishService } from './marketing-publish.service';
import { MarketingBudgetService } from './marketing-budget.service';
import { UpsertMarketingProfileDto } from './dto/upsert-marketing-profile.dto';
import { SetMonthlyBudgetDto } from './dto/set-monthly-budget.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

type ThreadsMediaType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('marketing')
export class MarketingProfileController {
  constructor(
    private readonly service: MarketingProfileService,
    private readonly ads: MarketingAdsService,
    private readonly publish: MarketingPublishService,
    private readonly budgetService: MarketingBudgetService,
    private readonly credentials: MarketingCredentialsService,
  ) {}

  // ─── Publicação direta (dono) ──────────────────────────────

  @Post('instagram/publish')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Publica um post no Instagram (imagem ou vídeo/Reels + legenda)' })
  publishInstagram(
    @CurrentOrg('id') orgId: string,
    @Body()
    body: {
      caption?: string;
      imageUrl?: string;
      videoUrl?: string;
      channelId?: string;
    },
  ) {
    return this.publish.publishInstagram(orgId, body);
  }

  @Post('threads/publish')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Publica um post no Threads (texto, imagem ou vídeo)' })
  publishThreads(
    @CurrentOrg('id') orgId: string,
    @Body() body: { text?: string; imageUrl?: string; videoUrl?: string },
  ) {
    // Deriva o mediaType a partir do que veio (a UI manda texto + mídia opcional).
    const mediaType: ThreadsMediaType = body.videoUrl
      ? 'VIDEO'
      : body.imageUrl
        ? 'IMAGE'
        : 'TEXT';
    return this.publish.publishThreads(orgId, {
      mediaType,
      text: body.text,
      imageUrl: body.imageUrl,
      videoUrl: body.videoUrl,
    });
  }

  // ─── Gestão de anúncios (Meta Ads) — ação direta do dono ───

  /**
   * `channelId` (opcional em todas as rotas abaixo) escolhe de QUAL conta de
   * Instagram o painel está falando. Sem ele valem as credenciais da
   * organização — o comportamento de sempre, e o certo pra quem só tem uma.
   */
  @Get('accounts')
  @ApiOperation({ summary: 'Contas de Instagram disponíveis para o marketing' })
  async marketingAccounts(@CurrentOrg('id') orgId: string) {
    return { accounts: await this.credentials.listAccounts(orgId) };
  }

  @Post('accounts/default')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Define a conta de Instagram padrão — é a que os agentes de IA usam, já que o contexto deles não carrega canal.',
  })
  async setDefaultAccount(
    @CurrentOrg('id') orgId: string,
    @Body() body: { channelId: string | null },
  ) {
    await this.credentials.setDefaultAccount(orgId, body.channelId ?? null);
    return { ok: true };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Resumo do painel: pacing de verba + insights da conta' })
  overview(
    @CurrentOrg('id') orgId: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('all') all?: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.overview(
      orgId,
      since,
      until,
      all === '1' || all === 'true',
      channelId,
    );
  }

  @Get('ads/campaigns')
  @ApiOperation({ summary: 'Lista campanhas de anúncio (Meta Ads) ao vivo' })
  listCampaigns(
    @CurrentOrg('id') orgId: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.listCampaigns(orgId, channelId);
  }

  @Post('ads/campaigns/:id/status')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Pausa/ativa uma campanha' })
  setCampaignStatus(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED'; channelId?: string },
  ) {
    return this.ads.setCampaignStatus(orgId, id, body.status, body.channelId);
  }

  @Delete('ads/campaigns/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Exclui uma campanha' })
  deleteCampaign(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.deleteCampaign(orgId, id, channelId);
  }

  @Get('ads/campaigns/:id/adsets')
  @ApiOperation({ summary: 'Lista os conjuntos de anúncios de uma campanha' })
  listAdSets(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.listAdSets(orgId, id, channelId);
  }

  @Post('ads/campaigns/:id/budget')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Edita o orçamento diário de uma campanha' })
  setCampaignBudget(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() body: { dailyBudgetCents: number; channelId?: string },
  ) {
    return this.ads.setCampaignBudget(
      orgId,
      id,
      body.dailyBudgetCents,
      body.channelId,
    );
  }

  @Get('instagram/posts')
  @ApiOperation({ summary: 'Posts recentes do Instagram (com miniatura)' })
  instagramPosts(
    @CurrentOrg('id') orgId: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.listInstagramPosts(orgId, channelId);
  }

  @Delete('instagram/posts/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Exclui um post do Instagram (irreversível)' })
  deleteInstagramPost(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.deleteInstagramPost(orgId, id, channelId);
  }

  @Get('instagram/comments')
  @ApiOperation({ summary: 'Comentários de um post, com as respostas' })
  instagramComments(
    @CurrentOrg('id') orgId: string,
    @Query('mediaId') mediaId: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.listInstagramComments(orgId, mediaId, channelId);
  }

  @Post('instagram/comments/:id/reply')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Responde publicamente um comentário do Instagram' })
  replyInstagramComment(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() body: { message: string; channelId?: string },
  ) {
    return this.ads.replyInstagramComment(
      orgId,
      id,
      body.message,
      body.channelId,
    );
  }

  @Post('instagram/comments/:id/hide')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Oculta ou reexibe um comentário' })
  hideInstagramComment(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body()
    body: {
      hide: boolean;
      channelId?: string;
      // Cópia do comentário: a Meta não devolve os ocultos na listagem, então
      // guardamos o que a tela precisa pra continuar mostrando e reexibir.
      mediaId?: string;
      text?: string;
      username?: string;
      timestamp?: string;
      likes?: number;
    },
  ) {
    return this.ads.hideInstagramComment(orgId, id, body.hide, body.channelId, {
      mediaId: body.mediaId,
      text: body.text,
      username: body.username,
      timestamp: body.timestamp,
      likes: body.likes,
    });
  }

  @Delete('instagram/comments/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Exclui um comentário (irreversível)' })
  deleteInstagramComment(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Query('channelId') channelId?: string,
  ) {
    return this.ads.deleteInstagramComment(orgId, id, channelId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Regras de marketing da organização' })
  getProfile(@CurrentOrg('id') orgId: string) {
    return this.service.get(orgId);
  }

  @Put('profile')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cria/atualiza as regras de marketing da organização' })
  upsertProfile(
    @CurrentOrg('id') orgId: string,
    @Body() dto: UpsertMarketingProfileDto,
  ) {
    return this.service.upsert(orgId, dto);
  }

  // ─── Verba de mídia mês a mês ────────────────────────

  @Get('budgets/:year')
  @ApiOperation({
    summary:
      'Verba de mídia dos 12 meses do ano, com a origem de cada um (definida, herdada do mês anterior ou valor legado).',
  })
  listBudgets(@CurrentOrg('id') orgId: string, @Param('year') year: string) {
    return this.budgetService.listYear(orgId, parseInt(year, 10));
  }

  @Put('budgets/:year/:month')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Define a verba de um mês específico' })
  setBudget(
    @CurrentOrg('id') orgId: string,
    @Param('year') year: string,
    @Param('month') month: string,
    @Body() dto: SetMonthlyBudgetDto,
  ) {
    return this.budgetService.setMonth(
      orgId,
      parseInt(year, 10),
      parseInt(month, 10),
      dto.amountCents,
      dto.note,
    );
  }

  @Delete('budgets/:year/:month')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary: 'Remove a verba própria do mês — ele volta a herdar do mês anterior',
  })
  clearBudget(
    @CurrentOrg('id') orgId: string,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.budgetService.clearMonth(orgId, parseInt(year, 10), parseInt(month, 10));
  }

  @Post('crew-channel')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Garante (idempotente) o canal interno de comando da crew e retorna ids p/ abrir a conversa',
  })
  ensureCrewChannel(@CurrentOrg('id') orgId: string) {
    return this.service.ensureCrewChannel(orgId);
  }

  @Post('resync')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Re-aplica (idempotente, in-process) correções nas definições das skills da crew',
  })
  resync(@CurrentOrg('id') orgId: string) {
    return this.service.resync(orgId);
  }

  @Post('reset-test-data')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Reset dos dados de teste da crew: apaga análises/atividades e arquiva conversas de cron (métricas preservadas)',
  })
  resetTestData(@CurrentOrg('id') orgId: string) {
    return this.service.resetTestData(orgId);
  }

  @Get('crew-channels')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Canais atendidos pela crew + externos disponíveis' })
  listCrewChannels(@CurrentOrg('id') orgId: string) {
    return this.service.listCrewChannels(orgId);
  }

  @Post('crew-channels')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Vincula um canal externo (ex.: Telegram) à crew' })
  attachCrewChannel(
    @CurrentOrg('id') orgId: string,
    @Body() body: { channelId: string; lockSender?: boolean },
  ) {
    return this.service.attachCrewChannel(orgId, body.channelId, body.lockSender);
  }

  @Delete('crew-channels/:channelId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Desvincula um canal da crew' })
  detachCrewChannel(
    @CurrentOrg('id') orgId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.service.detachCrewChannel(orgId, channelId);
  }

  @Get('activity')
  @ApiOperation({ summary: 'Log de atividade + análises recentes de marketing' })
  activity(
    @CurrentOrg('id') orgId: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.activity(
      orgId,
      limit ? Math.min(parseInt(limit, 10) || 50, 200) : 50,
    );
  }

  @Get('media-metrics')
  @ApiOperation({
    summary: 'Métricas por post do Instagram (série temporal, pela janela do perfil)',
  })
  mediaMetrics(
    @CurrentOrg('id') orgId: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('all') all?: string,
  ) {
    return this.service.mediaMetrics(
      orgId,
      limit ? Math.min(parseInt(limit, 10) || 500, 2000) : 500,
      since,
      until,
      all === '1' || all === 'true',
    );
  }

  @Get('ad-metrics')
  @ApiOperation({
    summary: 'Métricas por campanha de anúncio (Meta Ads), série temporal',
  })
  adMetrics(
    @CurrentOrg('id') orgId: string,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('all') all?: string,
  ) {
    return this.service.adMetrics(
      orgId,
      limit ? Math.min(parseInt(limit, 10) || 500, 2000) : 500,
      since,
      until,
      all === '1' || all === 'true',
    );
  }
}
