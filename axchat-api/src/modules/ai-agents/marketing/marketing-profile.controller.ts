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
import { UpsertMarketingProfileDto } from './dto/upsert-marketing-profile.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('Marketing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('marketing')
export class MarketingProfileController {
  constructor(private readonly service: MarketingProfileService) {}

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
    @Body() body: { channelId: string },
  ) {
    return this.service.attachCrewChannel(orgId, body.channelId);
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
}
