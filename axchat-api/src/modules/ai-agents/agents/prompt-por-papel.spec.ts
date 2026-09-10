import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

/**
 * O prompt é o que define o agente como especialista: é o produto que a Axory
 * vende e, nos agentes do cliente, a estratégia comercial dele por escrito.
 *
 * Fechar a rota inteira não serve — a caixa de entrada usa esta mesma lista pra
 * escolher quem atende a conversa, e isso é trabalho de atendente. Então o
 * campo some da resposta, a rota continua de pé.
 */
describe('Prompt do agente por papel', () => {
  const AGENTE = {
    id: 'ag-1',
    name: 'Magnus',
    isActive: true,
    systemPrompt: 'Você é gestor de tráfego...',
    additionalInstructions: 'Não fale de concorrente.',
    operationalContext: 'Campanha de agosto rodando.',
    channels: [],
  };

  function montar() {
    const prisma = {
      aiAgent: {
        findMany: jest.fn().mockResolvedValue([{ ...AGENTE }]),
        findFirst: jest.fn().mockResolvedValue({ ...AGENTE }),
      },
    } as any;
    // Nenhum destes caminhos toca o registro de ferramentas.
    return new AgentsService(prisma, undefined as any);
  }

  const SIGILOSOS = [
    'systemPrompt',
    'additionalInstructions',
    'operationalContext',
  ] as const;

  it('atendente não recebe o prompt na lista', async () => {
    const [agente] = await montar().list('org-1', undefined, false);

    for (const campo of SIGILOSOS) {
      // Ausente, não vazio: campo em branco faria parecer agente mal
      // configurado, e alguém "consertaria" apagando o que não consegue ver.
      expect(agente).not.toHaveProperty(campo);
    }
  });

  it('atendente ainda recebe o que a caixa de entrada precisa', async () => {
    const [agente] = await montar().list('org-1', undefined, false);

    expect(agente).toMatchObject({ id: 'ag-1', name: 'Magnus', isActive: true });
  });

  it('atendente não recebe o prompt no detalhe', async () => {
    const agente = await montar().findOne('org-1', 'ag-1', false);

    for (const campo of SIGILOSOS) {
      expect(agente).not.toHaveProperty(campo);
    }
  });

  it('quem configura continua vendo tudo', async () => {
    const agente: any = await montar().findOne('org-1', 'ag-1', true);

    expect(agente.systemPrompt).toBe('Você é gestor de tráfego...');
    expect(agente.additionalInstructions).toBe('Não fale de concorrente.');
  });

  it('o padrão é ver — quem chama de dentro precisa do registro inteiro', async () => {
    const agente: any = await montar().findOne('org-1', 'ag-1');

    // A trava do agente gerenciado compara o prompt recebido com o gravado.
    // Se o padrão escondesse o campo, a comparação passaria a bater contra
    // `undefined` e a trava deixaria de travar — em silêncio.
    expect(agente.systemPrompt).toBeDefined();
  });

  /**
   * A parte que decide de verdade é o controller: é ele que lê o papel de quem
   * pediu e traduz num sim/não. O serviço só obedece — se a tradução estiver
   * errada, o dono da empresa para de ver o próprio prompt e ninguém percebe
   * até alguém reclamar que a tela de edição veio vazia.
   */
  describe('quem decide é o papel de quem pediu', () => {
    function comController() {
      const service = {
        list: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({}),
      } as any;
      return { controller: new AgentsController(service), service };
    }

    const CASOS: Array<[string, string | undefined, boolean, boolean]> = [
      // papel,        userRole,  isSuperAdmin, deveVerPrompt
      ['dono',         'OWNER',   false, true],
      ['administrador','ADMIN',   false, true],
      ['atendente',    'AGENT',   false, false],
      ['super admin',  undefined, true,  true],
      ['papel ausente', undefined, false, false],
    ];

    it.each(CASOS)('%s', async (_nome, userRole, isSuperAdmin, deveVer) => {
      const { controller, service } = comController();
      const user = { isSuperAdmin } as any;

      await controller.list('org-1', userRole, user, undefined);
      expect(service.list).toHaveBeenCalledWith('org-1', undefined, deveVer);

      await controller.findOne('org-1', 'ag-1', userRole, user);
      expect(service.findOne).toHaveBeenCalledWith('org-1', 'ag-1', deveVer);
    });

    it('sem papel e sem usuário o prompt não vaza', async () => {
      const { controller, service } = comController();

      // Se um dia o guard parar de preencher `userRole`, o padrão tem que ser
      // esconder. Errar pro lado de mostrar o prompt é o erro caro.
      await controller.findOne('org-1', 'ag-1');

      expect(service.findOne).toHaveBeenCalledWith('org-1', 'ag-1', false);
    });
  });
});
