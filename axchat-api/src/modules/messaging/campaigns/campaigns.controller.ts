import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto, AudienceDto } from './dto/create-campaign.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentOrg, CurrentUser, Roles } from '../../../common/decorators';

@ApiTags('Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Roles(OrgRole.OWNER, OrgRole.ADMIN)
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly service: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista as campanhas de disparo da org' })
  list(@CurrentOrg('id') orgId: string) {
    return this.service.list(orgId);
  }

  @Post('preview-audience')
  @ApiOperation({ summary: 'Conta quantos contatos a audiência atinge' })
  preview(@CurrentOrg('id') orgId: string, @Body() audience: AudienceDto) {
    return this.service.previewAudience(orgId, audience);
  }

  @Post()
  @ApiOperation({ summary: 'Cria uma campanha (rascunho) e resolve os destinatários' })
  create(
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.service.create(orgId, dto, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da campanha + destinatários' })
  get(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.get(orgId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Dispara a campanha (enfileira os envios)' })
  send(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.send(orgId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancela a campanha (impede os envios ainda pendentes)' })
  cancel(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.cancel(orgId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a campanha' })
  remove(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.remove(orgId, id);
  }
}
