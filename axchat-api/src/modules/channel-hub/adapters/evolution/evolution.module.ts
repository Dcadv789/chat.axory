import { Module } from '@nestjs/common';
import { EvolutionSettingsService } from './evolution-settings.service';
import { EvolutionHttpClient } from './evolution.http-client';
import { EvolutionMessageMapper } from './evolution.message-mapper';
import { EvolutionConnectionService } from './evolution-connection.service';
import { EvolutionInboundAdapter } from './evolution.inbound-adapter';
import { EvolutionOutboundAdapter } from './evolution.outbound-adapter';
import { EvolutionChannelService } from './evolution-channel.service';

/**
 * WhatsApp não oficial via Evolution API.
 *
 * `EvolutionSettingsService` e `EvolutionHttpClient` são exportados porque o
 * Super Admin também mexe neles (endereço do servidor e o botão "testar"), e o
 * fluxo de QR precisa criar instância antes de existir canal ativo.
 */
@Module({
  providers: [
    EvolutionSettingsService,
    EvolutionHttpClient,
    EvolutionMessageMapper,
    EvolutionConnectionService,
    EvolutionInboundAdapter,
    EvolutionOutboundAdapter,
    EvolutionChannelService,
  ],
  exports: [
    EvolutionSettingsService,
    EvolutionHttpClient,
    EvolutionConnectionService,
    EvolutionInboundAdapter,
    EvolutionOutboundAdapter,
    EvolutionChannelService,
  ],
})
export class EvolutionModule {}
