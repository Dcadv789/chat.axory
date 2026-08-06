import { Test } from '@nestjs/testing';
import { ToolsModule } from './tools.module';

/**
 * Injeção de dependência do Nest NÃO é verificada pelo TypeScript: um provider
 * faltando compila, passa no tsc e só explode ao subir a aplicação. Foi assim
 * que a API foi pro ar sem MarketingCredentialsService no ToolsModule — 503, e
 * ninguém conseguia entrar no sistema.
 *
 * `compile()` monta o grafo inteiro sem chamar onModuleInit, então valida a
 * injeção sem precisar de banco nem Redis.
 */
describe('ToolsModule — grafo de injeção', () => {
  it('resolve todos os providers', async () => {
    const mod = await Test.createTestingModule({
      imports: [ToolsModule],
    }).compile();

    expect(mod).toBeDefined();
    await mod.close();
  });
});
