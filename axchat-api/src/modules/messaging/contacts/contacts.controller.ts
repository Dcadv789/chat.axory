import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { ContactsService } from './contacts.service';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CreateContactDto, ImportContactsDto } from './dto/create-contact.dto';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../../common/guards';
import { CurrentOrg, Roles } from '../../../common/decorators';

@ApiTags('Contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard, RolesGuard)
@Controller('contacts')
export class ContactsController {
  constructor(private readonly service: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts with search, tag/campaign filters and pagination' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'tagId', required: false })
  @ApiQuery({ name: 'campaign', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findAll(
    @CurrentOrg('id') orgId: string,
    @Query('search') search?: string,
    @Query('tagId') tagId?: string,
    @Query('campaign') campaign?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      orgId,
      search,
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
      { tagId: tagId || undefined, campaign: campaign || undefined },
    );
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Distinct campaigns used by contacts (for filter/autocomplete)' })
  campaigns(@CurrentOrg('id') orgId: string) {
    return this.service.listCampaigns(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a contact manually (name, phone, email, campaign, tags)' })
  create(@CurrentOrg('id') orgId: string, @Body() dto: CreateContactDto) {
    return this.service.create(orgId, dto);
  }

  @Post('import')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Bulk import contacts from a spreadsheet (rows parsed on the client)' })
  import(@CurrentOrg('id') orgId: string, @Body() dto: ImportContactsDto) {
    return this.service.importBulk(orgId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact detail with channels, tags, conversations' })
  findOne(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.findOne(id, orgId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact (name, phone, email, notes, campaign, tagIds, metadata)' })
  update(@Param('id') id: string, @CurrentOrg('id') orgId: string, @Body() dto: UpdateContactDto) {
    return this.service.update(id, orgId, dto);
  }

  @Delete(':id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Soft delete contact' })
  remove(@Param('id') id: string, @CurrentOrg('id') orgId: string) {
    return this.service.remove(id, orgId);
  }
}
