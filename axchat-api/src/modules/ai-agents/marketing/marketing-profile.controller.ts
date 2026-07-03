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
import { UpsertMarketingProfileDto } from './dto/upsert-marketing-profile.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('marketing')
export class MarketingProfileController {
  constructor(
    private readonly service: MarketingProfileService,
    private readonly ads: MarketingAdsService,
  ) {}

  // ─── Gestão de anúncios (Meta Ads) — ação direta do dono ───

  @Get('overview')
  @ApiOperation({ summary: 'Resumo do painel: pacing de verba + insights da conta' })
  overview(@CurrentOrg('id') orgId: string, @Query('days') days?: string) {
    return this.ads.overview(orgId, days ? parseInt(days, 10) || undefined : undefined);
  }

  @Get('ads/campaigns')
  @ApiOperation({ summary: 'Lista campanhas de anúncio (Meta Ads) ao vivo' })
  listCampaigns(@CurrentOrg('id') orgId: string) {
    return this.ads.listCampaigns(orgId);
  }

  @Post('ads/campaigns/:id/status')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Pausa/ativa uma campanha' })
  setCampaignStatus(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() body: { status: 'ACTIVE' | 'PAUSED' },
  ) {
    return this.ads.setCampaignStatus(orgId, id, body.status);
  }

  @Delete('ads/campaigns/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Exclui uma campanha' })
  deleteCampaign(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.ads.deleteCampaign(orgId, id);
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
    @Query('days') days?: string,
  ) {
    return this.service.mediaMetrics(
      orgId,
      limit ? Math.min(parseInt(limit, 10) || 500, 2000) : 500,
      days ? parseInt(days, 10) || undefined : undefined,
    );
  }

  @Get('ad-metrics')
  @ApiOperation({
    summary: 'Métricas por campanha de anúncio (Meta Ads), série temporal',
  })
  adMetrics(
    @CurrentOrg('id') orgId: string,
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ) {
    return this.service.adMetrics(
      orgId,
      limit ? Math.min(parseInt(limit, 10) || 500, 2000) : 500,
      days ? parseInt(days, 10) || undefined : undefined,
    );
  }
}
