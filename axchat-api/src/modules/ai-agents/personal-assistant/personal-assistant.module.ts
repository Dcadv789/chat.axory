import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../../database/prisma.module';
import { RealtimeModule } from '../../realtime/realtime.module';
import { PersonalAssistantProvisioningService } from './personal-assistant-provisioning.service';
import { PersonalAssistantService } from './personal-assistant.service';
import { PersonalAssistantController } from './personal-assistant.controller';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderProcessor } from './reminder.processor';
import { AssistantDeliveryService } from './assistant-delivery.service';
import { DailyBriefingService } from './daily-briefing.service';

@Module({
  imports: [
    PrismaModule,
    RealtimeModule,
    BullModule.registerQueue(
      { name: 'personal-reminders' },
      { name: 'outbound-messages' },
    ),
  ],
  controllers: [PersonalAssistantController],
  providers: [
    PersonalAssistantProvisioningService,
    PersonalAssistantService,
    AssistantDeliveryService,
    DailyBriefingService,
    ReminderSchedulerService,
    ReminderProcessor,
  ],
  exports: [PersonalAssistantProvisioningService],
})
export class PersonalAssistantModule {}
