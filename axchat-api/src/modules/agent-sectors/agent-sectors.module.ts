import { Module } from '@nestjs/common';
import { AgentSectorsController } from './agent-sectors.controller';
import { AgentSectorsService } from './agent-sectors.service';
import { JwtAuthGuard, OrgGuard, RolesGuard } from '../../common/guards';

@Module({
  controllers: [AgentSectorsController],
  providers: [AgentSectorsService, JwtAuthGuard, OrgGuard, RolesGuard],
  exports: [AgentSectorsService],
})
export class AgentSectorsModule {}
