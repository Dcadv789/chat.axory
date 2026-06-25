import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

const DEFAULT_MODEL = process.env.AI_DEFAULT_MODEL_ID || 'deepseek-chat';

// ─── Tools NOVAS ───────────────────────────────────────────────
// As tools Instagram e Google Business já são criadas por
// scripts/seed-marketing-skills.mjs — aqui só adicionamos as duas
// que ainda não existem. Skills que reusam Instagram/GBP (publicar,
// analisar mídia) são apenas vinculadas aos agentes mais abaixo.

const tools = [
  {
    name: 'Meta Ads',
    description:
      'Meta Marketing API (Graph) — leitura de insights da ad account/campanhas, listagem e criação de campanhas, estimativa de alcance/delivery e ajuste de orçamento diário.',
    source: 'CUSTOM_HTTP',
    httpBaseUrl: 'https://graph.facebook.com/v21.0',
    httpHeaders: {
      Authorization: 'Bearer {{env.META_ADS_ACCESS_TOKEN}}',
      'Content-Type': 'application/json',
    },
  },
  {
    name: 'OpenAI Images',
    description:
      'OpenAI Images API — geração de imagem (gpt-image-1) para criativos de anúncio e posts. A copy/legenda sai do próprio LLM; esta tool entrega só a arte.',
    source: 'CUSTOM_HTTP',
    httpBaseUrl: 'https://api.openai.com/v1',
    httpHeaders: {
      Authorization: 'Bearer {{env.OPENAI_API_KEY}}',
      'Content-Type': 'application/json',
    },
  },
];

// ─── Skills NOVAS ──────────────────────────────────────────────
// toolName 'Instagram' aponta para a tool já existente (seed-marketing-skills);
// o runner resolve o toolId no banco se ela não for criada aqui.

const skills = [
  // ── Meta Ads · leitura ──────────────────────────────────────
  {
    toolName: 'Meta Ads',
    name: 'getMetaAdsAccountInsights',
    category: 'Marketing/MetaAds',
    description:
      'Lê os insights agregados de uma ad account do Meta (gasto, impressões, alcance, cliques, CTR, CPC, CPM, conversões) num período.',
    promptInstructions:
      'Use para entender a performance geral da conta de anúncios. Requer o adAccountId SEM o prefixo "act_" (a skill já adiciona). datePreset aceita valores do Meta (today, yesterday, last_7d, last_30d, this_month, maximum). fields é uma lista CSV de métricas; o padrão cobre o essencial. Skill de LEITURA — não gasta verba, pode rodar à vontade.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{input.adAccountId}}/insights?fields={{input.fields}}&date_preset={{input.datePreset}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      insights: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        adAccountId: {
          type: 'string',
          description: 'ID numérico da ad account, SEM o prefixo act_.',
        },
        fields: {
          type: 'string',
          description:
            'Lista CSV de métricas da Marketing API (ex: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions").',
          default: 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions',
        },
        datePreset: {
          type: 'string',
          description:
            'Período pré-definido do Meta (today, yesterday, last_7d, last_30d, this_month, maximum).',
          default: 'last_30d',
        },
      },
      required: ['adAccountId', 'fields', 'datePreset'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'getMetaAdsCampaignInsights',
    category: 'Marketing/MetaAds',
    description:
      'Lê os insights de UMA campanha específica do Meta (gasto, impressões, alcance, cliques, CTR, CPC, CPM, conversões) num período.',
    promptInstructions:
      'Use para medir a performance de uma campanha individual. Requer o campaignId (obtido via listMetaAdsCampaigns). Mesmos fields/datePreset de getMetaAdsAccountInsights. Skill de LEITURA — não gasta verba.',
    httpMethod: 'GET',
    httpPath:
      '/{{input.campaignId}}/insights?fields={{input.fields}}&date_preset={{input.datePreset}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      insights: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'ID da campanha no Meta (obtido via listMetaAdsCampaigns).',
        },
        fields: {
          type: 'string',
          description:
            'Lista CSV de métricas (ex: "spend,impressions,reach,clicks,ctr,cpc,cpm,actions").',
          default: 'spend,impressions,reach,clicks,ctr,cpc,cpm,actions',
        },
        datePreset: {
          type: 'string',
          description:
            'Período pré-definido do Meta (today, yesterday, last_7d, last_30d, this_month, maximum).',
          default: 'last_30d',
        },
      },
      required: ['campaignId', 'fields', 'datePreset'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'listMetaAdsCampaigns',
    category: 'Marketing/MetaAds',
    description:
      'Lista as campanhas de uma ad account do Meta com nome, status, objetivo e orçamento (diário/lifetime).',
    promptInstructions:
      'Use para enxergar quais campanhas existem, o status (ACTIVE/PAUSED) e o orçamento atual antes de qualquer ajuste. Requer o adAccountId SEM o prefixo act_. O campo daily_budget vem em centavos (menor unidade da moeda). Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{input.adAccountId}}/campaigns?fields=name,status,effective_status,objective,daily_budget,lifetime_budget&limit={{input.limit}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      campaigns: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        adAccountId: {
          type: 'string',
          description: 'ID numérico da ad account, SEM o prefixo act_.',
        },
        limit: {
          type: 'integer',
          description: 'Quantas campanhas trazer.',
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['adAccountId', 'limit'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'estimateMetaAdsReach',
    category: 'Marketing/MetaAds',
    description:
      'Estima alcance/delivery de uma ad account para um targeting e optimization goal informados (endpoint delivery_estimate da Marketing API).',
    promptInstructions:
      'Use para estimar alcance/entrega ANTES de criar ou escalar uma campanha. Requer adAccountId (sem act_), optimizationGoal (ex: REACH, LINK_CLICKS, OFFSITE_CONVERSIONS) e targetingSpec — um JSON de targeting do Meta (ex: {"geo_locations":{"countries":["BR"]},"age_min":25,"age_max":45}) passado como STRING. ATENÇÃO: o targetingSpec precisa ser um JSON válido e URL-safe; se a API reclamar de encoding, simplifique o targeting. Skill de LEITURA — não cria nada.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{input.adAccountId}}/delivery_estimate?optimization_goal={{input.optimizationGoal}}&targeting_spec={{input.targetingSpec}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      estimate: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        adAccountId: {
          type: 'string',
          description: 'ID numérico da ad account, SEM o prefixo act_.',
        },
        optimizationGoal: {
          type: 'string',
          description:
            'Objetivo de otimização do Meta (REACH, LINK_CLICKS, IMPRESSIONS, OFFSITE_CONVERSIONS, etc).',
        },
        targetingSpec: {
          type: 'string',
          description:
            'JSON de targeting do Meta como string (ex: {"geo_locations":{"countries":["BR"]},"age_min":25,"age_max":45}).',
        },
      },
      required: ['adAccountId', 'optimizationGoal', 'targetingSpec'],
      additionalProperties: false,
    },
  },

  // ── Meta Ads · escrita (SENSÍVEIS — gating de aprovação no link) ──
  {
    toolName: 'Meta Ads',
    name: 'updateMetaAdsCampaignBudget',
    category: 'Marketing/MetaAds',
    description:
      'Ajusta o orçamento diário (daily_budget) de uma campanha do Meta. Valor em centavos da moeda da conta.',
    promptInstructions:
      'AÇÃO SENSÍVEL — mexe em verba real. Requer campaignId e dailyBudgetCents (em CENTAVOS: R$ 50,00/dia = 5000). Sempre confira o orçamento atual com listMetaAdsCampaigns antes. Esta skill normalmente está gateada por aprovação humana (requiresApproval) — não assuma que executou sozinha; aguarde a confirmação do inbox.',
    httpMethod: 'POST',
    httpPath: '/{{input.campaignId}}',
    httpBodyTemplate:
      '{"daily_budget":{{json:input.dailyBudgetCents}},"access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      success: '$.success',
    },
    parameters: {
      type: 'object',
      properties: {
        campaignId: {
          type: 'string',
          description: 'ID da campanha no Meta (obtido via listMetaAdsCampaigns).',
        },
        dailyBudgetCents: {
          type: 'integer',
          description:
            'Novo orçamento diário em CENTAVOS (ex: R$ 50,00 = 5000). Deve respeitar o mínimo do Meta.',
          minimum: 100,
        },
      },
      required: ['campaignId', 'dailyBudgetCents'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'createMetaAdsCampaign',
    category: 'Marketing/MetaAds',
    description:
      'Cria uma campanha no Meta (nível CAMPAIGN). Sempre nasce PAUSED, sem ad set/ad — esses passos exigem trabalho adicional fora desta skill.',
    promptInstructions:
      'AÇÃO SENSÍVEL — cria estrutura de mídia paga. Requer name e objective (ex: OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_SALES) e o adAccountId (sem act_). A campanha nasce status=PAUSED de propósito: ela ainda NÃO entrega anúncio nenhum até alguém criar ad set + ad e ativar. Esta skill normalmente está gateada por aprovação humana — aguarde confirmação. Não prometa que o anúncio já está no ar.',
    httpMethod: 'POST',
    httpPath: '/act_{{input.adAccountId}}/campaigns',
    httpBodyTemplate:
      '{"name":{{json:input.name}},"objective":{{json:input.objective}},"status":"PAUSED","special_ad_categories":[],"access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      campaignId: '$.id',
    },
    parameters: {
      type: 'object',
      properties: {
        adAccountId: {
          type: 'string',
          description: 'ID numérico da ad account, SEM o prefixo act_.',
        },
        name: {
          type: 'string',
          description: 'Nome da campanha.',
        },
        objective: {
          type: 'string',
          description:
            'Objetivo da campanha (OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_ENGAGEMENT, OUTCOME_LEADS, OUTCOME_SALES).',
        },
      },
      required: ['adAccountId', 'name', 'objective'],
      additionalProperties: false,
    },
  },

  // ── OpenAI Images · geração de criativo ─────────────────────
  {
    toolName: 'OpenAI Images',
    name: 'generateMarketingImage',
    category: 'Marketing/Criativo',
    description:
      'Gera uma imagem (gpt-image-1) a partir de um prompt textual, para usar como criativo de anúncio ou post. Retorna a imagem em base64.',
    promptInstructions:
      'Use quando precisar de uma ARTE/criativo visual. O prompt deve descrever cena, estilo, paleta e clima — seja específico (produto, enquadramento, mood). A copy/legenda NÃO sai daqui: você (LLM) escreve a copy separadamente. size aceita 1024x1024, 1024x1536 (retrato) ou 1536x1024 (paisagem). O retorno vem em base64 (imageBase64); avise o usuário que a imagem precisa ser salva/hospedada antes de virar URL pública para publicar no Instagram.',
    httpMethod: 'POST',
    httpPath: '/images/generations',
    httpBodyTemplate:
      '{"model":"gpt-image-1","prompt":{{json:input.prompt}},"size":{{json:input.size}},"n":{{json:input.n}}}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      imageBase64: '$.data[0].b64_json',
    },
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Descrição visual detalhada do criativo (cena, estilo, paleta, mood, enquadramento).',
        },
        size: {
          type: 'string',
          description: 'Dimensão da imagem.',
          default: '1024x1024',
          enum: ['1024x1024', '1024x1536', '1536x1024'],
        },
        n: {
          type: 'integer',
          description: 'Quantas variações gerar.',
          default: 1,
          minimum: 1,
          maximum: 4,
        },
      },
      required: ['prompt', 'size', 'n'],
      additionalProperties: false,
    },
  },

  // ── Instagram · leitura de posts passados (tool já existente) ─
  {
    toolName: 'Instagram',
    name: 'listInstagramMedia',
    category: 'Marketing/Instagram',
    description:
      'Lista as mídias publicadas recentemente na conta business do Instagram (id, legenda, tipo, url, permalink, data).',
    promptInstructions:
      'Use para revisar o histórico de posts — analisar o que já foi publicado, achar o mediaId de um post pra medir performance (via analyzeInstagramMedia) ou estudar padrões de conteúdo. Requer o igUserId (ig-user-id). Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath:
      '/{{input.igUserId}}/media?fields=id,caption,media_type,media_url,permalink,timestamp&limit={{input.limit}}&access_token={{env.IG_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      media: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        igUserId: {
          type: 'string',
          description: 'ID do usuário business do Instagram (ig-user-id).',
        },
        limit: {
          type: 'integer',
          description: 'Quantas mídias trazer.',
          default: 25,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['igUserId', 'limit'],
      additionalProperties: false,
    },
  },
];

// ─── Agentes ───────────────────────────────────────────────────
// Magnus = ORCHESTRATOR (raiz da crew). Os demais = WORKER com
// parentAgentId = Magnus. Todos sector=MARKETING, department=MARKETING.
//
// RESSALVA IMPORTANTE (documentada também em cada system prompt):
// o schema NÃO tem campo de cron/agendamento por agente. Os gatilhos
// "Cron mensal do Wystan", "Cron pós-Caspian do Edda" e "fila após X"
// são CONCEITUAIS — não existem no banco hoje. Estes agentes + skills +
// hierarquia são criados normalmente, mas o DISPARO automático por
// cron/fila ainda precisa de trabalho de backend que não existe.

const CRON_RESSALVA = `
ATENCAO (limite atual do sistema): nao existe agendamento/cron por agente no banco hoje.
Qualquer gatilho temporal ("todo mes", "apos a publicacao", "X dias depois") descrito abaixo
e CONCEITUAL. Voce so age quando o orquestrador (Magnus) te aciona na fila/handoff ou um humano
pede. Nao afirme que algo "vai rodar sozinho no dia X" — isso depende de backend ainda nao implementado.`;

const orchestrator = {
  name: 'Magnus',
  kind: 'ORCHESTRATOR',
  sector: 'MARKETING',
  department: 'MARKETING',
  category: 'Orquestracao de campanha',
  capabilities: ['orquestracao', 'roteamento', 'estado-campanha'],
  description:
    'Orquestrador da crew de marketing. Roteia a fila de trabalho entre Wystan, Alaric, Orla, Caspian e Edda e mantem o estado da campanha.',
  canRespondDirectly: true,
  temperature: 0.4,
  maxTokens: 1800,
  systemPrompt: `Voce e Magnus, o orquestrador da crew de marketing.

Sua funcao e coordenar uma campanha de ponta a ponta, delegando cada etapa ao especialista certo e mantendo o estado da campanha (objetivo, publico, verba, criativos, status de publicacao e resultados ja medidos).

Crew (seus subordinados):
- Wystan (midia paga / Meta Ads): le insights da conta, lista campanhas, estima alcance/delivery, ajusta orcamento diario e cria campanha (PAUSED).
- Alaric (analise): le a performance historica (Meta Ads + insights de Instagram + posts passados) e resume aprendizados.
- Orla (criativo): gera a arte/imagem (OpenAI) e escreve a copy.
- Caspian (publicacao): publica nos canais (Instagram e Google Business).
- Edda (mensuracao): mede o resultado depois (insights de Instagram + Meta Ads).

Fluxo tipico de uma campanha:
1) Alaric levanta o historico e o que funcionou.
2) Wystan dimensiona verba/alcance e prepara a campanha de midia.
3) Orla produz criativo + copy.
4) Caspian publica.
5) Edda mede e devolve o aprendizado pra voce fechar o ciclo.

Regras:
- Delegue uma etapa por vez e consolide o resultado antes de seguir.
- Acoes sensiveis (mexer em verba, criar campanha, publicar) podem exigir aprovacao humana — nao trate como garantidas.
- Mantenha um resumo vivo do estado da campanha em cada resposta.
${CRON_RESSALVA}`,
};

const workers = [
  {
    name: 'Wystan',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Midia paga',
    capabilities: ['meta-ads', 'orcamento', 'campanhas', 'delivery'],
    description:
      'Especialista de midia paga (Meta Ads): le insights da conta, lista e cria campanhas, estima alcance/delivery e ajusta orcamento diario.',
    canRespondDirectly: true,
    temperature: 0.35,
    maxTokens: 1800,
    systemPrompt: `Voce e Wystan, o gestor de midia paga (Meta Ads) da crew.

Responsabilidades:
- Ler os insights da ad account e de campanhas (getMetaAdsAccountInsights / getMetaAdsCampaignInsights).
- Listar campanhas e checar status/orcamento atual (listMetaAdsCampaigns) ANTES de qualquer ajuste.
- Estimar alcance/entrega para um targeting (estimateMetaAdsReach) antes de escalar.
- Ajustar orcamento diario (updateMetaAdsCampaignBudget) — valor em CENTAVOS.
- Criar campanha (createMetaAdsCampaign) — nasce sempre PAUSED, sem ad set/ad.

Conduta:
- updateMetaAdsCampaignBudget e createMetaAdsCampaign mexem em verba real e costumam estar gateadas por aprovacao humana: proponha o numero, justifique com dados e aguarde o OK. Nao afirme que ja executou.
- Sempre cite o estado atual (orcamento, status) antes de propor mudanca.
- Nunca prometa ROI, CPA ou resultado garantido.
- Lembre que criar campanha NAO coloca anuncio no ar: faltam ad set + ad + ativacao.
${CRON_RESSALVA}
(O ciclo mensal de revisao de midia que voce idealmente rodaria e, por ora, acionado manualmente por Magnus ou por um humano.)`,
  },
  {
    name: 'Alaric',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Analise de performance',
    capabilities: ['analise', 'benchmark', 'historico'],
    description:
      'Analista de performance: combina dados historicos do Meta Ads, insights de Instagram e posts passados para extrair aprendizados.',
    canRespondDirectly: true,
    temperature: 0.4,
    maxTokens: 1800,
    systemPrompt: `Voce e Alaric, o analista de performance da crew.

Responsabilidades:
- Levantar o historico: insights do Meta Ads (conta e campanhas), insights de posts do Instagram e a lista de posts passados.
- Cruzar essas fontes e resumir o que funcionou, o que nao funcionou e por que (hipoteses claras, separando dado de suposicao).

Skills que voce usa (todas de LEITURA):
- getMetaAdsAccountInsights, getMetaAdsCampaignInsights, listMetaAdsCampaigns (Meta Ads).
- listInstagramMedia (posts passados) e analyzeInstagramMedia (metricas de um post especifico).

Conduta:
- Sempre que possivel, baseie conclusoes em numeros reais que voce puxou — nao invente metrica.
- Deixe explicito quando algo e hipotese e nao fato medido.
- Entregue aprendizados acionaveis para Wystan (midia) e Orla (criativo).
${CRON_RESSALVA}`,
  },
  {
    name: 'Orla',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Criativo',
    capabilities: ['criativo', 'copywriting', 'geracao-imagem'],
    description:
      'Criativa: gera a arte/imagem (OpenAI gpt-image-1) e escreve a copy/legenda do proprio LLM.',
    canRespondDirectly: true,
    temperature: 0.8,
    maxTokens: 1800,
    systemPrompt: `Voce e Orla, a criativa da crew.

Responsabilidades:
- Gerar a ARTE do criativo com generateMarketingImage (gpt-image-1): escreva um prompt visual detalhado (cena, estilo, paleta, mood, enquadramento).
- Escrever a COPY/legenda voce mesma (isso NAO sai da tool de imagem) — adequada ao canal, com CTA claro e tom da marca.

Conduta:
- A imagem volta em base64; avise que ela precisa ser salva/hospedada (virar URL publica) antes de Caspian publicar no Instagram.
- Use os aprendizados de Alaric para orientar angulo e mensagem.
- Nada de promessas enganosas, claims sem base ou uso indevido de marca de terceiros.
${CRON_RESSALVA}`,
  },
  {
    name: 'Caspian',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Publicacao',
    capabilities: ['publicacao', 'instagram', 'google-business'],
    description:
      'Publicador: leva o criativo aprovado ao ar no Instagram e no Google Business (reusa as skills ja existentes).',
    canRespondDirectly: true,
    temperature: 0.4,
    maxTokens: 1600,
    systemPrompt: `Voce e Caspian, o publicador da crew.

Responsabilidades:
- Publicar no Instagram: fluxo de 2 passos — createInstagramMediaContainer (com imageUrl publica + caption) e depois publishInstagramMedia com o creationId.
- Publicar no Google Business: createGoogleBusinessPost.

Conduta:
- publishInstagramMedia e createGoogleBusinessPost colocam conteudo PUBLICO no ar e costumam estar gateadas por aprovacao humana: aguarde o OK, nao assuma que ja publicou.
- A imagem precisa estar numa URL publica acessivel a Meta (nao base64, nao localhost). Se so houver base64 da Orla, peca que seja hospedada antes.
- Confirme legenda final e canal antes de publicar.
${CRON_RESSALVA}`,
  },
  {
    name: 'Edda',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Mensuracao',
    capabilities: ['mensuracao', 'insights', 'fechamento-ciclo'],
    description:
      'Mensuracao: depois da publicacao, mede o resultado combinando insights de Instagram e Meta Ads.',
    canRespondDirectly: true,
    temperature: 0.35,
    maxTokens: 1800,
    systemPrompt: `Voce e Edda, responsavel pela mensuracao de resultado da crew.

Responsabilidades:
- Apos a publicacao, medir o desempenho: analyzeInstagramMedia (metricas do post), listInstagramMedia (achar o post certo) e os insights do Meta Ads (getMetaAdsCampaignInsights / getMetaAdsAccountInsights).
- Consolidar um relatorio de resultado e devolver o aprendizado para Magnus e Alaric.

Conduta:
- Use numeros reais puxados pelas skills; nao estime sem dado.
- Compare com a expectativa inicial da campanha quando houver.
- Aponte o que ajustar no proximo ciclo (verba, criativo, publico).
${CRON_RESSALVA}
(O ideal seria voce rodar automaticamente alguns dias apos Caspian publicar — esse gatilho pos-publicacao ainda NAO existe no backend; por ora Magnus ou um humano te aciona.)`,
  },
];

// ─── Vinculo agente ↔ skill (com gating de aprovacao) ──────────
// requiresApproval=true nas acoes que gastam verba ou publicam algo
// publico. Skills de leitura ficam livres.

const agentSkillLinks = {
  Magnus: [
    { skill: 'listMetaAdsCampaigns', requiresApproval: false },
    { skill: 'getMetaAdsAccountInsights', requiresApproval: false },
  ],
  Wystan: [
    { skill: 'getMetaAdsAccountInsights', requiresApproval: false },
    { skill: 'getMetaAdsCampaignInsights', requiresApproval: false },
    { skill: 'listMetaAdsCampaigns', requiresApproval: false },
    { skill: 'estimateMetaAdsReach', requiresApproval: false },
    { skill: 'updateMetaAdsCampaignBudget', requiresApproval: true },
    { skill: 'createMetaAdsCampaign', requiresApproval: true },
  ],
  Alaric: [
    { skill: 'getMetaAdsAccountInsights', requiresApproval: false },
    { skill: 'getMetaAdsCampaignInsights', requiresApproval: false },
    { skill: 'listMetaAdsCampaigns', requiresApproval: false },
    { skill: 'listInstagramMedia', requiresApproval: false },
    { skill: 'analyzeInstagramMedia', requiresApproval: false },
  ],
  Orla: [{ skill: 'generateMarketingImage', requiresApproval: false }],
  Caspian: [
    { skill: 'createInstagramMediaContainer', requiresApproval: false },
    { skill: 'publishInstagramMedia', requiresApproval: true },
    { skill: 'createGoogleBusinessPost', requiresApproval: true },
  ],
  Edda: [
    { skill: 'analyzeInstagramMedia', requiresApproval: false },
    { skill: 'listInstagramMedia', requiresApproval: false },
    { skill: 'getMetaAdsCampaignInsights', requiresApproval: false },
    { skill: 'getMetaAdsAccountInsights', requiresApproval: false },
  ],
};

// ─── Runner ────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao encontrado. Confira axchat-api/.env');
  }

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (organizations.length === 0) {
    throw new Error('Nenhuma organizacao encontrada. Rode primeiro: npm run prisma:seed');
  }

  for (const org of organizations) {
    console.log(`\nOrganizacao: ${org.name}`);

    // 1) Tools novas
    const toolByName = new Map();
    for (const tool of tools) {
      const saved = await upsertTool(org.id, tool);
      toolByName.set(tool.name, saved.id);
      console.log(`  tool: ${tool.name}`);
    }

    // 2) Resolve tools referenciadas mas nao criadas aqui (ex: Instagram)
    const referenced = new Set(skills.map((s) => s.toolName));
    for (const name of referenced) {
      if (toolByName.has(name)) continue;
      const found = await prisma.aiTool.findFirst({
        where: { organizationId: org.id, name, deletedAt: null },
        select: { id: true },
      });
      if (found) {
        toolByName.set(name, found.id);
      } else {
        console.warn(
          `  ! tool "${name}" nao encontrada (rode npm run prisma:seed:marketing antes). Skills dela serao puladas.`,
        );
      }
    }

    // 3) Skills novas
    for (const skill of skills) {
      const toolId = toolByName.get(skill.toolName);
      if (!toolId) {
        console.warn(`  pulando skill ${skill.name}: tool ${skill.toolName} indisponivel`);
        continue;
      }
      await upsertSkill(org.id, toolId, skill);
      console.log(`  skill: ${skill.name}`);
    }

    // 4) Mapa nome->id de TODAS as skills da org (inclui Instagram/GBP existentes)
    const allSkills = await prisma.aiSkill.findMany({
      where: { organizationId: org.id, deletedAt: null },
      select: { id: true, name: true },
    });
    const skillByName = new Map(allSkills.map((s) => [s.name, s.id]));

    // 5) Agentes — Magnus primeiro, depois workers apontando pra ele
    const magnus = await upsertAgent(org.id, orchestrator);
    console.log(`  agente: ${magnus.name} (ORCHESTRATOR)`);

    const agentByName = new Map([[magnus.name, magnus.id]]);
    for (const worker of workers) {
      const saved = await upsertAgent(org.id, {
        ...worker,
        parentAgentId: magnus.id,
      });
      agentByName.set(saved.name, saved.id);
      console.log(`  agente: ${saved.name} (WORKER -> Magnus)`);
    }

    // 6) Vinculos agente <-> skill
    for (const [agentName, links] of Object.entries(agentSkillLinks)) {
      const agentId = agentByName.get(agentName);
      if (!agentId) continue;
      for (const link of links) {
        const skillId = skillByName.get(link.skill);
        if (!skillId) {
          console.warn(
            `    ! skill "${link.skill}" nao encontrada para ${agentName} — vinculo pulado.`,
          );
          continue;
        }
        await prisma.aiAgentSkill.upsert({
          where: { agentId_skillId: { agentId, skillId } },
          update: { requiresApproval: link.requiresApproval },
          create: { agentId, skillId, requiresApproval: link.requiresApproval },
        });
      }
      console.log(`    vinculos de ${agentName}: ${links.length}`);
    }

    // 7) Cron de exemplo — revisão mensal de mídia do Wystan.
    //    Idempotente (findFirst por org+nome). nextRunAt aproximado
    //    (dia 1 09:00 BRT); o scheduler recalcula com precisão no 1º
    //    disparo, e a UI recalcula ao editar.
    const wystanId = agentByName.get('Wystan');
    if (wystanId) {
      await upsertCron(org.id, {
        agentId: wystanId,
        name: 'Revisão mensal de mídia',
        task:
          'Revise a performance de mídia paga (Meta Ads) do último mês: puxe os insights da ad account e das campanhas, identifique as de pior CPA/CTR e proponha ajustes de orçamento diário. Liste claramente o que recomenda mudar e por quê — não aplique mudança de budget sem aprovação.',
        cronExpression: '0 9 1 * *',
        timezone: 'America/Sao_Paulo',
        nextRunAt: nextMonthly9amBrt(),
      });
      console.log('    cron: Revisão mensal de mídia (Wystan, 0 9 1 * *)');
    }
  }
}

// Próximo dia 1 às 09:00 BRT (UTC-3, fixo desde 2019) => 12:00 UTC.
function nextMonthly9amBrt() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 12, 0, 0),
  );
}

async function upsertCron(organizationId, data) {
  const existing = await prisma.agentCron.findFirst({
    where: { organizationId, name: data.name, deletedAt: null },
    select: { id: true },
  });

  const payload = {
    organizationId,
    agentId: data.agentId,
    name: data.name,
    task: data.task,
    cronExpression: data.cronExpression,
    timezone: data.timezone ?? 'America/Sao_Paulo',
    isActive: true,
    nextRunAt: data.nextRunAt ?? null,
  };

  if (existing) {
    return prisma.agentCron.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.agentCron.create({ data: payload });
}

async function upsertTool(organizationId, data) {
  const existing = await prisma.aiTool.findFirst({
    where: { organizationId, name: data.name, deletedAt: null },
    select: { id: true },
  });

  const payload = {
    organizationId,
    name: data.name,
    description: data.description,
    source: data.source,
    httpBaseUrl: data.httpBaseUrl,
    httpHeaders: data.httpHeaders,
    isActive: true,
  };

  if (existing) {
    return prisma.aiTool.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.aiTool.create({ data: payload });
}

async function upsertSkill(organizationId, toolId, data) {
  const existing = await prisma.aiSkill.findFirst({
    where: { organizationId, name: data.name, deletedAt: null },
    select: { id: true },
  });

  const payload = {
    organizationId,
    name: data.name,
    description: data.description,
    category: data.category ?? null,
    promptInstructions: data.promptInstructions ?? null,
    source: 'HTTP',
    parameters: data.parameters ?? {},
    toolId,
    httpMethod: data.httpMethod,
    httpPath: data.httpPath,
    httpHeadersExtra: data.httpHeadersExtra ?? null,
    httpBodyTemplate: data.httpBodyTemplate ?? null,
    responseMap: data.responseMap ?? null,
    timeoutMs: data.timeoutMs ?? 15000,
    isActive: true,
  };

  if (existing) {
    return prisma.aiSkill.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.aiSkill.create({ data: { ...payload, currentVersion: 1 } });
}

async function upsertAgent(organizationId, data) {
  const existing = await prisma.aiAgent.findFirst({
    where: { organizationId, name: data.name, deletedAt: null },
    select: { id: true },
  });

  const payload = {
    organizationId,
    name: data.name,
    description: data.description,
    kind: data.kind,
    sector: data.sector,
    category: data.category,
    capabilities: data.capabilities,
    department: data.department,
    squad: data.squad ?? 'Marketing IA',
    parentAgentId: data.parentAgentId ?? null,
    modelId: DEFAULT_MODEL,
    modelParams: {},
    systemPrompt: data.systemPrompt,
    temperature: data.temperature,
    maxTokens: data.maxTokens,
    canRespondDirectly: data.canRespondDirectly,
    isActive: true,
    // Crew de back-office de marketing: nao persegue lead, sem follow-up automatico.
    followUpEnabled: false,
    followUpCadenceHours: [],
  };

  if (existing) {
    return prisma.aiAgent.update({ where: { id: existing.id }, data: payload });
  }
  return prisma.aiAgent.create({ data: payload });
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

main()
  .catch((error) => {
    console.error('Erro ao semear agentes de marketing:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
