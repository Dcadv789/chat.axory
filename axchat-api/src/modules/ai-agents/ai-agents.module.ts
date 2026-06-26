import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../database/prisma.module';
import { LlmModule } from './llm/llm.module';
import { ToolsModule } from './tools/tools.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChannelHubModule } from '../channel-hub/channel-hub.module';
import { PromptBuilderService } from './runner/prompt-builder.service';
import { AiAgentRunnerService } from './runner/agent-runner.service';
import { CatalogSyncService } from './runner/catalog-sync.service';
import { DatabaseIntrospectionService } from './tools/database-introspection.service';
import { MediaUrlResolverService } from './runner/media-url-resolver.service';
import { AgentRouterService } from './router/agent-router.service';
import { AgentsService } from './agents/agents.service';
import { AgentsController } from './agents/agents.controller';
import { ToolsCatalogService } from './catalog/tools.service';
import { SkillsCatalogService } from './catalog/skills.service';
import { OrganizationSecretService } from './catalog/organization-secret.service';
import { AiCatalogController } from './catalog/catalog.controller';

// ─── Fase 2 — AI Intelligence Layer ──────────────
import { PromptsModule } from './prompts/prompts.module';
import { ClassifierModule } from './classifier/classifier.module';
import { ShortTermMemoryModule } from './memory/short-term/short-term.module';
import { LongTermMemoryModule } from './memory/long-term/long-term.module';
import { ConfirmationsModule } from './confirmations/confirmations.module';
import { ConfirmationExecutorModule } from './confirmations/confirmation-executor.module';
import { RagModule } from './rag/rag.module';
import { EvalsModule } from './evals/evals.module';

// ─── Agendamento de agentes (cron) ───────────────
import { AgentCronsService } from './crons/agent-crons.service';
import { AgentCronsController } from './crons/agent-crons.controller';
import { AgentCronSchedulerService } from './crons/agent-cron-scheduler.service';
import { AgentCronProcessor } from './crons/agent-cron.processor';
import { CronTriggerService } from './crons/cron-trigger.service';
import { IsCronExpressionConstraint } from './crons/dto/create-agent-cron.dto';
import { MarketingProfileController } from './marketing/marketing-profile.controller';
import { MarketingProfileService } from './marketing/marketing-profile.service';
import { MarketingProvisioningService } from './marketing/marketing-provisioning.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    LlmModule,
    ToolsModule,
    NotificationsModule,
    RealtimeModule,
    forwardRef(() => ChannelHubModule),
    PromptsModule,
    ClassifierModule,
    ShortTermMemoryModule,
    LongTermMemoryModule,
    ConfirmationsModule,
    ConfirmationExecutorModule,
    RagModule,
    EvalsModule,
    BullModule.registerQueue({ name: 'agent-crons' }),
  ],
  controllers: [
    AgentsController,
    AiCatalogController,
    AgentCronsController,
    MarketingProfileController,
  ],
  providers: [
    PromptBuilderService,
    AiAgentRunnerService,
    AgentRouterService,
    AgentsService,
    ToolsCatalogService,
    SkillsCatalogService,
    OrganizationSecretService,
    CatalogSyncService,
    MediaUrlResolverService,
    DatabaseIntrospectionService,
    AgentCronsService,
    AgentCronSchedulerService,
    AgentCronProcessor,
    CronTriggerService,
    IsCronExpressionConstraint,
    MarketingProfileService,
    MarketingProvisioningService,
  ],
  exports: [AiAgentRunnerService, AgentRouterService, MarketingProvisioningService],
})
export class AiAgentsModule {}
