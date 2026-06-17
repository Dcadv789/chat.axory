import { Module } from '@nestjs/common';
import { TelegramHttpClient } from './telegram.http-client';
import { TelegramInboundAdapter } from './telegram.inbound-adapter';
import { TelegramMessageMapper } from './telegram.message-mapper';
import { TelegramOutboundAdapter } from './telegram.outbound-adapter';

@Module({
  providers: [
    TelegramHttpClient,
    TelegramInboundAdapter,
    TelegramMessageMapper,
    TelegramOutboundAdapter,
  ],
  exports: [
    TelegramHttpClient,
    TelegramInboundAdapter,
    TelegramOutboundAdapter,
  ],
})
export class TelegramModule {}
