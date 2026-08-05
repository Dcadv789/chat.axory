import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SaveNotificationPreferencesDto } from './dto/save-notification-preferences.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, CurrentOrg } from '../../common/decorators';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByUser(
      userId,
      orgId,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.getUnreadCount(userId, orgId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  getPreferences(
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.getPreferences(userId, orgId);
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Save notification preferences for current user' })
  savePreferences(
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
    @Body() dto: SaveNotificationPreferencesDto,
  ) {
    return this.service.savePreferences(userId, orgId, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@Param('id') id: string) {
    return this.service.markRead(id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(
    @CurrentUser('id') userId: string,
    @CurrentOrg('id') orgId: string,
  ) {
    return this.service.markAllRead(userId, orgId);
  }
}
