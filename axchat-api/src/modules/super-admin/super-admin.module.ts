import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { ToolsModule } from '../ai-agents/tools/tools.module';
import { AiAgentsModule } from '../ai-agents/ai-agents.module';
import { PersonalAssistantModule } from '../ai-agents/personal-assistant/personal-assistant.module';
import { LlmModule } from '../ai-agents/llm/llm.module';
import { EvolutionModule } from '../channel-hub/adapters/evolution/evolution.module';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRATION', '15m') as SignOptions['expiresIn'],
        },
      }),
    }),
    ToolsModule,
    AiAgentsModule,
    PersonalAssistantModule,
    // Config global do motor de IA (aba "Motor de IA" do Super Admin).
    LlmModule,
    // Endereço do servidor Evolution (aba "Integrações"). Importar o módulo
    // inteiro, e não só o serviço, é o que evita duas instâncias com caches
    // divergentes — trocar o servidor numa não invalidaria a outra.
    EvolutionModule,
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
