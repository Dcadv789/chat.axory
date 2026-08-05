import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmService } from './llm.service';
import { AiEngineSettingsService } from './ai-engine-settings.service';

@Module({
  imports: [ConfigModule],
  providers: [LlmService, AiEngineSettingsService],
  exports: [LlmService, AiEngineSettingsService],
})
export class LlmModule {}
