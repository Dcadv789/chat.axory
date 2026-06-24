import { Module } from '@nestjs/common';
import { InternalInboundAdapter } from './internal.inbound-adapter';
import { InternalOutboundAdapter } from './internal.outbound-adapter';

@Module({
  providers: [InternalInboundAdapter, InternalOutboundAdapter],
  exports: [InternalInboundAdapter, InternalOutboundAdapter],
})
export class InternalModule {}
