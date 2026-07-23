import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../../database/prisma.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignProcessor } from './campaign.processor';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue(
      { name: 'campaigns' },
      { name: 'outbound-messages' },
    ),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignProcessor],
})
export class CampaignsModule {}
