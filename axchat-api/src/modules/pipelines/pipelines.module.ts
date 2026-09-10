import { Module } from '@nestjs/common';
import { PipelinesController } from './pipelines.controller';
import { PipelinesService } from './pipelines.service';
import { CardActivityService } from './card-activity.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [PipelinesController],
  providers: [PipelinesService, CardActivityService],
  // A IA e as automações movem card — precisam do serviço fora deste módulo.
  exports: [PipelinesService, CardActivityService],
})
export class PipelinesModule {}
