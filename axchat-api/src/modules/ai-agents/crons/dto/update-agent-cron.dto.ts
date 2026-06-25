import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateAgentCronDto } from './create-agent-cron.dto';

// agentId não é editável após criação — recrie o cron pra trocar o agente.
export class UpdateAgentCronDto extends PartialType(
  OmitType(CreateAgentCronDto, ['agentId'] as const),
) {}
