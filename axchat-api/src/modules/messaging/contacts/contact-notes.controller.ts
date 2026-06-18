import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ContactNotesService } from './contact-notes.service';
import { JwtAuthGuard, OrgGuard } from '../../../common/guards';
import { CurrentUser } from '../../../common/decorators';
import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreateContactNoteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;
}

@ApiTags('Contact Notes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OrgGuard)
@Controller('contacts/:contactId/notes')
export class ContactNotesController {
  constructor(private readonly service: ContactNotesService) {}

  @Get()
  @ApiOperation({ summary: 'List notes for a contact' })
  findAll(@Param('contactId') contactId: string) {
    return this.service.findByContact(contactId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a note to a contact' })
  create(
    @Param('contactId') contactId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateContactNoteDto,
  ) {
    return this.service.create(contactId, userId, dto.content);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact note' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
