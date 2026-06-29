import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentOrg, CurrentUser } from '../../../common/decorators';
import { PendingActionService } from './pending-action.service';
import type { PendingAction } from './confirmation.types';

/**
 * REST endpoints for the destructive-action confirmation system.
 *
 *   GET    /pending-actions               -> list PENDING (optionally per conversation)
 *   GET    /pending-actions/:id           -> fetch one
 *   POST   /pending-actions/:id/approve   -> approve (only PENDING)
 *   POST   /pending-actions/:id/reject    -> reject  (only PENDING; reason required)
 *
 * Todas as rotas são escopadas pela organização do request (OrgGuard +
 * x-organization-id). O service valida que a ação pertence à org atual antes
 * de listar/ler/aprovar/rejeitar — sem isso, qualquer usuário autenticado
 * poderia aprovar/ler ações de OUTRA empresa (IDOR cross-tenant).
 */
@ApiTags('AI Pending Actions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('pending-actions')
export class PendingActionController {
  constructor(private readonly service: PendingActionService) {}

  @Get()
  @ApiOperation({
    summary:
      'List PENDING destructive actions for the current org. Optionally filter by conversationId.',
  })
  async list(
    @CurrentOrg('id') orgId: string,
    @Query('conversationId') conversationId?: string,
  ): Promise<PendingAction[]> {
    return this.service.listPending(orgId, conversationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single pending action by id.' })
  async get(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
  ): Promise<PendingAction> {
    const action = await this.service.get(id, orgId);
    if (!action) throw new NotFoundException('Pending action not found');
    return action;
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve a pending action and unlock execution.' })
  async approve(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PendingAction> {
    return this.service.approve(id, userId, orgId);
  }

  @Post(':id/reject')
  @ApiOperation({ summary: 'Reject a pending action with a reason.' })
  async reject(
    @Param('id') id: string,
    @CurrentOrg('id') orgId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { reason: string },
  ): Promise<PendingAction> {
    return this.service.reject(id, userId, body?.reason ?? '', orgId);
  }
}
