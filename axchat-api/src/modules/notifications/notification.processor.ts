import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Processor('notifications', { concurrency: 10 })
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(private readonly realtimeGateway: RealtimeGateway) {
    super();
  }

  async process(job: Job): Promise<any> {
    const {
      notificationId,
      recipientId,
      organizationId,
      type,
      title,
      body,
      data,
      browserPush,
      sound,
    } = job.data;

    // `browserPush`/`sound` vêm da preferência do usuário (já com o "Não
    // perturbe" aplicado). O cliente usa esses flags pra decidir se dispara a
    // Notification do navegador e se toca o som — o sininho sempre aparece.
    this.realtimeGateway.emitToUser(recipientId, 'notification:new', {
      id: notificationId,
      recipientId,
      type,
      title,
      body,
      data,
      browserPush: browserPush !== false,
      sound: sound !== false,
      createdAt: new Date().toISOString(),
    });

    this.logger.log(`Notification delivered via WS: ${notificationId} to user:${recipientId}`);

    return { delivered: true, channels: ['in-app'] };
  }
}
