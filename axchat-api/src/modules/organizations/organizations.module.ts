import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsRepository } from './organizations.repository';
import { AiModelProvidersService } from './ai-model-providers.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository, AiModelProvidersService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
