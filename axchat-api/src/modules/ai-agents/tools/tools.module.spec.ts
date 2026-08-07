import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ToolsModule } from './tools.module';
import { ChannelAccessModule } from '../../iam/channel-access/channel-access.module';
import { AutomationsModule } from '../../automations/automations.module';

/**
 * Injeção de dependência do Nest NÃO é verificada pelo TypeScript: um provider
 * faltando compila, passa no tsc e só explode ao subir a aplicação. Foi assim
 * que a API foi pro ar sem MarketingCredentialsService no ToolsModule — 503, e
 * ninguém conseguia entrar no sistema.
 *
 * `compile()` monta o grafo sem chamar onModuleInit, então valida a injeção sem
 * precisar de banco nem Redis de verdade — o BullMQ registra as filas, mas só
 * abriria conexão ao usar uma.
 */
describe('ToolsModule — grafo de injeção', () => {
  it('resolve todos os providers', async () => {
    const mod = await Test.createTestingModule({
      // Os @Global() do app precisam estar aqui: "global" no Nest só vale
      // depois que o módulo entra no grafo, e quem os carrega em produção é o
      // AppModule. Sem eles o teste falharia por um motivo que não é o que ele
      // quer pegar (provider faltando dentro do ToolsModule).
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        BullModule.forRoot({ connection: { host: 'localhost', port: 6379 } }),
        ChannelAccessModule,
        AutomationsModule,
        ToolsModule,
      ],
    }).compile();

    expect(mod).toBeDefined();
    await mod.close();
  });
});
