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
import { KnowledgeService } from './knowledge.service';
import {
  SetSectorKnowledgeDto,
  UpsertCompanyKnowledgeDto,
  UpsertKnowledgeDocumentDto,
} from './knowledge.dto';
import { CurrentOrg, Roles } from '../../../common/decorators';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';

@ApiTags('Base de conhecimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly service: KnowledgeService) {}

  @Get('company')
  @ApiOperation({ summary: 'Conhecimento estruturado da empresa' })
  getCompany(@CurrentOrg('id') orgId: string) {
    return this.service.get(orgId);
  }

  @Put('company')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cria/atualiza o conhecimento da empresa' })
  upsertCompany(
    @CurrentOrg('id') orgId: string,
    @Body() dto: UpsertCompanyKnowledgeDto,
  ) {
    return this.service.upsert(orgId, dto);
  }

  @Put('sectors/:sectorId')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({
    summary:
      'Conhecimento de um departamento — entra só no prompt dos agentes dele',
  })
  setSector(
    @CurrentOrg('id') orgId: string,
    @Param('sectorId') sectorId: string,
    @Body() dto: SetSectorKnowledgeDto,
  ) {
    return this.service.setSectorKnowledge(orgId, sectorId, dto.knowledge ?? null);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Documentos da base de conhecimento' })
  listDocuments(
    @CurrentOrg('id') orgId: string,
    @Query('inativos') inativos?: string,
  ) {
    return this.service.listDocuments(
      orgId,
      inativos === '1' || inativos === 'true',
    );
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Conteúdo completo de um documento' })
  getDocument(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.getDocument(orgId, id);
  }

  @Post('documents')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Cria um documento' })
  createDocument(
    @CurrentOrg('id') orgId: string,
    @Body() dto: UpsertKnowledgeDocumentDto,
  ) {
    return this.service.createDocument(orgId, dto);
  }

  @Put('documents/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Edita um documento' })
  updateDocument(
    @CurrentOrg('id') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpsertKnowledgeDocumentDto,
  ) {
    return this.service.updateDocument(orgId, id, dto);
  }

  @Delete('documents/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Remove um documento' })
  removeDocument(@CurrentOrg('id') orgId: string, @Param('id') id: string) {
    return this.service.removeDocument(orgId, id);
  }
}
