// Nomes de job da fila BullMQ 'agent-crons'.
export const AGENT_CRON_TICK_JOB = 'agent-cron-tick';
export const AGENT_CRON_RUN_NOW_JOB = 'agent-cron-run-now';

// Pattern do tick: a cada minuto varre os crons vencidos.
export const AGENT_CRON_TICK_PATTERN = '* * * * *';
