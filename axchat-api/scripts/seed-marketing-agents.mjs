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
];

// NOTA: a geração de imagem deixou de ser skill HTTP e virou a tool BUILTIN
// `generateMarketingImage` (gpt-image-1 + hospedagem da arte). Ela é
// auto-disponível pra agentes WORKER (Orla usa). Não há AiTool/AiSkill no
// banco pra isso — por isso a tool "OpenAI Images" e a skill homônima foram
// removidas daqui (e são limpas no runner abaixo). A chave fica em
// OPENAI_API_KEY (org secret, aba Integrações).

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
      'Use para entender a performance geral da conta de anúncios. A conta de anúncios já está pré-configurada na org (env META_AD_ACCOUNT_ID) — você NÃO precisa pedir o ID a ninguém. datePreset aceita valores do Meta (today, yesterday, last_7d, last_30d, this_month, maximum). fields é uma lista CSV de métricas; o padrão cobre o essencial. Skill de LEITURA — não gasta verba, pode rodar à vontade.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{env.META_AD_ACCOUNT_ID}}/insights?fields={{input.fields}}&date_preset={{input.datePreset}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      insights: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
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
      required: ['fields', 'datePreset'],
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
      'Use para enxergar quais campanhas existem, o status (ACTIVE/PAUSED) e o orçamento atual antes de qualquer ajuste. A ad account já está pré-configurada na org (env META_AD_ACCOUNT_ID). O campo daily_budget vem em centavos (menor unidade da moeda). O `id` de cada campanha é o que as outras skills (insights/budget) precisam. Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{env.META_AD_ACCOUNT_ID}}/campaigns?fields=name,status,effective_status,objective,daily_budget,lifetime_budget&limit={{input.limit}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      campaigns: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Quantas campanhas trazer.',
          default: 50,
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['limit'],
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
      'Use para estimar alcance/entrega ANTES de criar ou escalar uma campanha. A ad account já está pré-configurada na org (env META_AD_ACCOUNT_ID). Passe optimizationGoal (ex: REACH, LINK_CLICKS, OFFSITE_CONVERSIONS) e targetingSpec — um JSON de targeting do Meta (ex: {"geo_locations":{"countries":["BR"]},"age_min":25,"age_max":45}) como STRING. ATENÇÃO: o targetingSpec precisa ser um JSON válido e URL-safe; se a API reclamar de encoding, simplifique o targeting. Skill de LEITURA — não cria nada.',
    httpMethod: 'GET',
    httpPath:
      '/act_{{env.META_AD_ACCOUNT_ID}}/delivery_estimate?optimization_goal={{input.optimizationGoal}}&targeting_spec={{input.targetingSpec}}&access_token={{env.META_ADS_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      estimate: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
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
      required: ['optimizationGoal', 'targetingSpec'],
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
      'AÇÃO SENSÍVEL — cria estrutura de mídia paga. A ad account já está pré-configurada na org (env META_AD_ACCOUNT_ID). Passe name e objective (ex: OUTCOME_TRAFFIC, OUTCOME_AWARENESS, OUTCOME_SALES). A campanha nasce status=PAUSED de propósito: ela ainda NÃO entrega anúncio nenhum até alguém criar ad set + ad e ativar. Esta skill normalmente está gateada por aprovação humana — aguarde confirmação. Não prometa que o anúncio já está no ar.',
    httpMethod: 'POST',
    httpPath: '/act_{{env.META_AD_ACCOUNT_ID}}/campaigns',
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
      required: ['name', 'objective'],
      additionalProperties: false,
    },
  },

  // ── Meta Ads · funil de anúncio (SENSÍVEIS — gated) ─────────
  // Sequência pra colocar um anúncio no ar: createMetaAdsCampaign →
  // createMetaAdsAdSet → createMetaAdsAdCreative → createMetaAdsAd →
  // setMetaAdsStatus(ACTIVE) em cada nível.
  {
    toolName: 'Meta Ads',
    name: 'createMetaAdsAdSet',
    category: 'Marketing/MetaAds',
    description:
      'Cria um ad set (conjunto de anúncios) dentro de uma campanha: define público (targeting), orçamento diário, evento de cobrança e meta de otimização. Nasce PAUSED.',
    promptInstructions:
      'AÇÃO SENSÍVEL — define gasto e público. A ad account já está pré-configurada (env META_AD_ACCOUNT_ID). Requer campaignId (de createMetaAdsCampaign/listMetaAdsCampaigns), name, dailyBudgetCents (CENTAVOS), billingEvent (IMPRESSIONS ou LINK_CLICKS), optimizationGoal (REACH, LINK_CLICKS, LANDING_PAGE_VIEWS, OFFSITE_CONVERSIONS...) e targeting — JSON do Meta como STRING válido (ex: {"geo_locations":{"countries":["BR"]},"age_min":25,"age_max":45,"publisher_platforms":["instagram"]}). Nasce PAUSED; só vai ao ar via setMetaAdsStatus. Normalmente gateada por aprovação.',
    httpMethod: 'POST',
    httpPath: '/act_{{env.META_AD_ACCOUNT_ID}}/adsets',
    httpBodyTemplate:
      '{"name":{{json:input.name}},"campaign_id":{{json:input.campaignId}},"daily_budget":{{json:input.dailyBudgetCents}},"billing_event":{{json:input.billingEvent}},"optimization_goal":{{json:input.optimizationGoal}},"bid_strategy":"LOWEST_COST_WITHOUT_CAP","targeting":{{input.targeting}},"status":"PAUSED","access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', adSetId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'ID da campanha (de createMetaAdsCampaign).' },
        name: { type: 'string', description: 'Nome do ad set.' },
        dailyBudgetCents: {
          type: 'integer',
          description: 'Orçamento diário em CENTAVOS (ex: R$ 50,00 = 5000).',
          minimum: 100,
        },
        billingEvent: {
          type: 'string',
          description: 'Evento de cobrança.',
          enum: ['IMPRESSIONS', 'LINK_CLICKS'],
          default: 'IMPRESSIONS',
        },
        optimizationGoal: {
          type: 'string',
          description:
            'Meta de otimização (REACH, LINK_CLICKS, LANDING_PAGE_VIEWS, IMPRESSIONS, OFFSITE_CONVERSIONS, POST_ENGAGEMENT).',
        },
        targeting: {
          type: 'string',
          description:
            'JSON de targeting do Meta como string. Ex: {"geo_locations":{"countries":["BR"]},"age_min":25,"age_max":45,"publisher_platforms":["instagram"]}.',
        },
      },
      required: ['campaignId', 'name', 'dailyBudgetCents', 'billingEvent', 'optimizationGoal', 'targeting'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'createMetaAdsAdCreative',
    category: 'Marketing/MetaAds',
    description:
      'Cria o criativo do anúncio (imagem + copy + link + CTA) ligado à Página do Facebook e à conta do Instagram. Retorna creativeId para usar em createMetaAdsAd.',
    promptInstructions:
      'AÇÃO SENSÍVEL. A Página (env FB_PAGE_ID) e a conta IG (env IG_USER_ID) já estão pré-configuradas. Requer name, message (a copy do anúncio), imageUrl (a URL pública que a Orla gerou com generateMarketingImage), destinationUrl (link de destino) e ctaType (LEARN_MORE, SHOP_NOW, SIGN_UP, BOOK_TRAVEL, CONTACT_US, etc). NÃO invente imageUrl — use a que a Orla entregou. Normalmente gateada por aprovação.',
    httpMethod: 'POST',
    httpPath: '/act_{{env.META_AD_ACCOUNT_ID}}/adcreatives',
    httpBodyTemplate:
      '{"name":{{json:input.name}},"object_story_spec":{"page_id":"{{env.FB_PAGE_ID}}","instagram_user_id":"{{env.IG_USER_ID}}","link_data":{"message":{{json:input.message}},"link":{{json:input.destinationUrl}},"picture":{{json:input.imageUrl}},"call_to_action":{"type":{{json:input.ctaType}},"value":{"link":{{json:input.destinationUrl}}}}}},"access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', creativeId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do criativo.' },
        message: { type: 'string', description: 'Copy/texto do anúncio.' },
        imageUrl: {
          type: 'string',
          description: 'URL pública da imagem (a que a Orla gerou). Deve ser acessível à Meta.',
        },
        destinationUrl: { type: 'string', description: 'Link de destino do anúncio.' },
        ctaType: {
          type: 'string',
          description: 'Botão de CTA do Meta.',
          enum: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'BOOK_TRAVEL', 'CONTACT_US', 'SUBSCRIBE'],
          default: 'LEARN_MORE',
        },
      },
      required: ['name', 'message', 'imageUrl', 'destinationUrl', 'ctaType'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'createMetaAdsAd',
    category: 'Marketing/MetaAds',
    description:
      'Cria o anúncio (ad) ligando um ad set a um criativo. Nasce PAUSED. Retorna adId.',
    promptInstructions:
      'AÇÃO SENSÍVEL. Último passo da montagem: requer adSetId (de createMetaAdsAdSet), creativeId (de createMetaAdsAdCreative) e name. Nasce PAUSED — só entrega depois de setMetaAdsStatus(ACTIVE) na campanha, no ad set E no ad. Normalmente gateada por aprovação.',
    httpMethod: 'POST',
    httpPath: '/act_{{env.META_AD_ACCOUNT_ID}}/ads',
    httpBodyTemplate:
      '{"name":{{json:input.name}},"adset_id":{{json:input.adSetId}},"creative":{"creative_id":{{json:input.creativeId}}},"status":"PAUSED","access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', adId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do anúncio.' },
        adSetId: { type: 'string', description: 'ID do ad set (de createMetaAdsAdSet).' },
        creativeId: { type: 'string', description: 'ID do criativo (de createMetaAdsAdCreative).' },
      },
      required: ['name', 'adSetId', 'creativeId'],
      additionalProperties: false,
    },
  },

  {
    toolName: 'Meta Ads',
    name: 'setMetaAdsStatus',
    category: 'Marketing/MetaAds',
    description:
      'Liga (ACTIVE) ou pausa (PAUSED) qualquer entidade do Meta Ads (campanha, ad set ou ad) pelo seu id.',
    promptInstructions:
      'AÇÃO SENSÍVEL — ACTIVE coloca o anúncio NO AR e começa a gastar. Pra ativar um anúncio novo, rode em sequência: campanha ACTIVE, depois ad set ACTIVE, depois ad ACTIVE (os três precisam estar ACTIVE). entityId é o id da entidade; status ACTIVE ou PAUSED. Normalmente gateada por aprovação humana — não ative sozinho.',
    httpMethod: 'POST',
    httpPath: '/{{input.entityId}}',
    httpBodyTemplate:
      '{"status":{{json:input.status}},"access_token":"{{env.META_ADS_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', success: '$.success' },
    parameters: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'ID da campanha, ad set ou ad a ligar/pausar.',
        },
        status: {
          type: 'string',
          description: 'Novo status.',
          enum: ['ACTIVE', 'PAUSED'],
        },
      },
      required: ['entityId', 'status'],
      additionalProperties: false,
    },
  },

  // ── Instagram · comentários (engajamento) ───────────────────
  {
    toolName: 'Instagram',
    name: 'listInstagramComments',
    category: 'Marketing/Instagram',
    description:
      'Lista os comentários de uma mídia do Instagram (id, texto, autor, data) para monitorar e responder.',
    promptInstructions:
      'Use para descobrir comentários a responder num post. Requer o mediaId (de listInstagramMedia). O commentId de cada item é o que replyToInstagramComment precisa. Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath:
      '/{{input.mediaId}}/comments?fields=id,text,username,timestamp&access_token={{env.IG_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: { ok: '$.ok', status: '$.status', comments: '$.data' },
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'ID da mídia do Instagram (de listInstagramMedia).',
        },
      },
      required: ['mediaId'],
      additionalProperties: false,
    },
  },

  // (geração de imagem agora é a tool BUILTIN generateMarketingImage — ver runner)

  // ── Instagram · leitura de posts passados (tool já existente) ─
  {
    toolName: 'Instagram',
    name: 'listInstagramMedia',
    category: 'Marketing/Instagram',
    description:
      'Lista as mídias publicadas recentemente na conta business do Instagram (id, legenda, tipo, url, permalink, data).',
    promptInstructions:
      'Use para revisar o histórico de posts — analisar o que já foi publicado, achar o mediaId de um post pra medir performance (via analyzeInstagramMedia) ou estudar padrões de conteúdo. A conta do Instagram já está pré-configurada na org (env IG_USER_ID). Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath:
      '/{{env.IG_USER_ID}}/media?fields=id,caption,media_type,media_url,permalink,timestamp&limit={{input.limit}}&access_token={{env.IG_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      media: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Quantas mídias trazer.',
          default: 25,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ['limit'],
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

// Como o agente e acionado (cron de agente JA EXISTE — Settings > Crons).
const TRIGGER_NOTE = `
COMO VOCE E ACIONADO: por um cron de agente (Settings > Crons), por delegacao do Magnus, ou por um humano. Voce roda numa conversa interna e a SUA resposta e o registro do trabalho. Faca o que da pra fazer agora; o que depender de aprovacao humana, deixe proposto e sinalizado — nao afirme que ja executou.`;

// Credenciais e IDs vem pre-configurados na org — o agente nunca pede.
const ID_NOTE = `
CREDENCIAIS: as contas (Meta Ads, Instagram, Pagina do Facebook, Google Business) e as chaves ja estao pre-configuradas na org (Settings > Integracoes). Voce NUNCA pede token, ad account, ig-user-id, page id ou account/location — as skills puxam isso sozinhas. Se uma skill falhar por credencial faltando, diga QUAL credencial preencher e pare.`;

// Regras da org + registro no banco. Define autonomia de publico/verba.
const DATA_NOTE = `
REGRAS & REGISTRO: consulte getMarketingProfile pra conhecer as regras da org (o que a empresa faz, produtos, publico-alvo, tom de voz, diretrizes e teto de verba) ANTES de definir publico, criar campanha, escrever copy ou propor verba — nunca invente regra nem orcamento; respeite os tetos. Se voce produz analise, relatorio ou decisao (ex: definicao de publico), grave com recordMarketingAnalysis pra ficar salvo e auditavel no banco.`;

const orchestrator = {
  name: 'Magnus',
  kind: 'ORCHESTRATOR',
  sector: 'MARKETING',
  department: 'MARKETING',
  category: 'Orquestracao de campanha',
  capabilities: ['orquestracao', 'roteamento', 'estado-campanha'],
  description:
    'Orquestrador da crew de marketing. Coordena os dois fluxos (anuncio pago e publicacao organica), delega a etapa certa a cada especialista e mantem o estado da campanha.',
  canRespondDirectly: true,
  temperature: 0.4,
  maxTokens: 2000,
  systemPrompt: `Voce e Magnus, o orquestrador da crew de marketing.

Missao: conduzir o trabalho de ponta a ponta delegando cada etapa ao especialista certo (delegateToAgent) e mantendo o ESTADO vivo (objetivo, publico, verba, criativo, status de publicacao/anuncio, resultados).

Crew (delegue por delegateToAgent — todos do setor MARKETING):
- Alaric — Analise & Estrategia: le historico (Meta Ads + Instagram) e define angulo/recomendacao.
- Wystan — Midia paga (Meta Ads): monta e opera anuncio de ponta a ponta (campanha > ad set > criativo > ad > ativar), orcamento e insights.
- Orla — Criativo: gera a arte (generateMarketingImage) e escreve a copy.
- Caspian — Publicacao & Comunidade: publica posts (Instagram e Google) e responde comentarios/reviews.
- Edda — Mensuracao: mede resultado e fecha o ciclo.

Os DOIS fluxos que voce coordena:
A) ANUNCIO PAGO no Instagram: Alaric (historico/angulo) > Orla (arte+copy) > Wystan (campanha+ad set+criativo+ad usando a url da Orla) > aprovacao humana pra ativar > Edda (mede).
B) PUBLICACAO ORGANICA (post comum): Alaric (angulo, opcional) > Orla (arte+copy) > Caspian (publica IG/Google) > Edda (mede). Caspian tambem responde comentarios do IG e reviews do Google.

Regras:
- Delegue UMA etapa por vez e consolide o retorno antes da proxima. A profundidade de delegacao e limitada — nao tente encadear os 5 numa tacada so; avance por etapas, uma delegacao de cada vez.
- Acoes que gastam verba, publicam ou ativam sao gateadas por aprovacao humana — trate como PROPOSTAS ate o OK.
- Em toda resposta, deixe um resumo curto do estado e qual o proximo passo.
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
};

const workers = [
  {
    name: 'Wystan',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Midia paga',
    capabilities: ['meta-ads', 'campanhas', 'ad-set', 'criativo-ad', 'orcamento'],
    description:
      'Gestor de midia paga (Meta Ads): monta e opera anuncios de ponta a ponta — campanha, ad set, criativo, ad e ativacao — alem de orcamento e insights.',
    canRespondDirectly: true,
    temperature: 0.35,
    maxTokens: 2000,
    systemPrompt: `Voce e Wystan, o gestor de midia paga (Meta Ads). Voce monta e opera anuncios de ponta a ponta.

LEITURA (use antes de agir):
- getMetaAdsAccountInsights / getMetaAdsCampaignInsights — performance da conta/campanha.
- listMetaAdsCampaigns — campanhas, status e orcamento (o id da campanha vem daqui).
- estimateMetaAdsReach — estimar alcance/entrega de um targeting antes de escalar.

MONTAR UM ANUNCIO (sequencia; cada passo usa o id do anterior):
1) createMetaAdsCampaign (objetivo) -> campaignId. Nasce PAUSED.
2) createMetaAdsAdSet (campaignId + targeting + dailyBudgetCents + billingEvent + optimizationGoal) -> adSetId. Nasce PAUSED.
3) createMetaAdsAdCreative (imageUrl da Orla + copy + destinationUrl + ctaType) -> creativeId.
4) createMetaAdsAd (adSetId + creativeId) -> adId. Nasce PAUSED.
5) setMetaAdsStatus(ACTIVE) na campanha, no ad set E no ad — os tres precisam estar ACTIVE pra entregar.
Orcamento: updateMetaAdsCampaignBudget (valor em CENTAVOS).

CONDUTA:
- TODAS as acoes de montar/ativar/gastar sao gateadas por aprovacao humana: monte o plano, justifique com dados, proponha numeros e AGUARDE o OK. Nao afirme que subiu/ativou.
- So ative (setMetaAdsStatus ACTIVE) com aprovacao explicita — e ativando os 3 niveis.
- A arte e a copy vem da Orla (via Magnus). Voce nao gera criativo; usa a url que ela entregou.
- Nunca prometa ROI, CPA ou resultado garantido.
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
  },
  {
    name: 'Alaric',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Analise & Estrategia',
    capabilities: ['analise', 'estrategia', 'benchmark', 'historico'],
    description:
      'Analista & estrategista: le o historico (Meta Ads + Instagram) e transforma em angulo de mensagem e recomendacao acionavel pro criativo e pra midia.',
    canRespondDirectly: true,
    temperature: 0.4,
    maxTokens: 1800,
    systemPrompt: `Voce e Alaric, analista e estrategista da crew. Seu trabalho e virar dado em decisao.

SKILLS (todas de LEITURA):
- getMetaAdsAccountInsights / getMetaAdsCampaignInsights / listMetaAdsCampaigns — Meta Ads.
- listInstagramMedia (posts passados) + analyzeInstagramMedia (metricas de um post).

ENTREGUE SEMPRE:
- O que funcionou e o que nao funcionou, com numeros reais. Nao invente metrica; separe dado de hipotese.
- Recomendacao acionavel: publico sugerido, formato, angulo de mensagem e — se for anuncio — objetivo e faixa de budget sugeridos pro Wystan, e a direcao criativa pra Orla.
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
  },
  {
    name: 'Orla',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Criativo',
    capabilities: ['criativo', 'copywriting', 'geracao-imagem'],
    description:
      'Criativa: gera a arte (generateMarketingImage) e escreve a copy. Entrega o par {url da imagem + copy} pronto pra publicar ou virar anuncio.',
    canRespondDirectly: true,
    temperature: 0.8,
    maxTokens: 1800,
    systemPrompt: `Voce e Orla, a criativa da crew.

ENTREGAVEL: o par {url da imagem + copy} pronto pra publicar (Caspian) ou virar anuncio (Wystan).
- Arte: generateMarketingImage (gpt-image-1) com um prompt visual detalhado (cena, estilo, paleta, mood, enquadramento). Ela JA hospeda e retorna uma url publica (campo "url"). Sem base64 pra tratar.
- Copy: escreva voce mesma, no tom da marca, com CTA claro, adequada ao canal (feed IG, anuncio, Google).

CONDUTA:
- Devolva SEMPRE a url EXATAMENTE como veio + a copy. Quem publica e o Caspian; quem monta anuncio e o Wystan.
- Use o angulo do Alaric pra orientar mensagem e visual.
- Nada de promessa enganosa, claim sem base ou marca de terceiros.
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
  },
  {
    name: 'Caspian',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Publicacao & Comunidade',
    capabilities: ['publicacao', 'instagram', 'google-business', 'comentarios', 'reviews'],
    description:
      'Publicacao & Comunidade: publica posts (Instagram e Google) e cuida da comunidade — responde comentarios do Instagram e avaliacoes do Google.',
    canRespondDirectly: true,
    temperature: 0.4,
    maxTokens: 1800,
    systemPrompt: `Voce e Caspian, responsavel por publicacao e comunidade.

PUBLICAR no Instagram — todos os formatos terminam em publishInstagramMedia(creationId):
- Feed (imagem): createInstagramMediaContainer (imageUrl da Orla + caption) > publish.
- Reels/video: createInstagramReel (videoUrl + caption) > getInstagramContainerStatus ate FINISHED > publish.
- Story (imagem): createInstagramStory (imageUrl) > publish.
- Carrossel (2 a 10): createInstagramCarouselItem por imagem > createInstagramCarouselContainer (lista de ids + caption) > publish.
PUBLICAR no Google Business: createGoogleBusinessPost (summary).

COMUNIDADE / REPUTACAO:
- Instagram (comentarios): listInstagramComments (de um post) > replyToInstagramComment.
- AUTOMACAO comentario->DM: quando um usuario comenta pedindo algo (material, link, preco), responda o comentario (replyToInstagramComment) E mande o material na DM — sendInstagramDirectMessage (texto/link) ou sendInstagramDirectMedia (arquivo por URL publica). O recipientId e o IGSID do usuario que veio no evento do comentario (nao e o @username). So mande DM com gancho real (a pessoa pediu/comentou); nunca spam.
- Google: listGoogleBusinessReviews > replyToGoogleBusinessReview.

CONDUTA:
- publishInstagramMedia, createGoogleBusinessPost, replyToInstagramComment e replyToGoogleBusinessReview colocam conteudo PUBLICO no ar e sao gateadas por aprovacao: deixe pronto e AGUARDE o OK; nao assuma que publicou/respondeu.
- Use a url de imagem que a Orla entregou — nao invente url.
- Respostas cordiais, em PT-BR, sem dado pessoal do cliente, sem promessa comercial. Review negativa ou comentario sensivel: proponha a resposta e peca aprovacao humana — nunca responda solo.
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
  },
  {
    name: 'Edda',
    kind: 'WORKER',
    sector: 'MARKETING',
    department: 'MARKETING',
    category: 'Mensuracao',
    capabilities: ['mensuracao', 'insights', 'fechamento-ciclo'],
    description:
      'Mensuracao: mede o resultado de posts e anuncios (insights de Instagram + Meta Ads) e devolve o aprendizado pra fechar o ciclo.',
    canRespondDirectly: true,
    temperature: 0.35,
    maxTokens: 1800,
    systemPrompt: `Voce e Edda, responsavel pela mensuracao e fechamento de ciclo.

Depois que algo foi publicado ou um anuncio rodou, meca:
- Post organico: listInstagramMedia (acha o post) + analyzeInstagramMedia (metricas).
- Anuncio: getMetaAdsCampaignInsights / getMetaAdsAccountInsights.

ENTREGUE um relatorio curto com numeros reais (nao estime sem dado), comparando com a expectativa inicial quando houver, e devolva pro Magnus e Alaric o aprendizado: o que ajustar no proximo ciclo (verba, criativo, publico, horario).
${DATA_NOTE}
${ID_NOTE}
${TRIGGER_NOTE}`,
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
    // Funil completo de anúncio (todas gated — montam/ativam mídia paga real)
    { skill: 'createMetaAdsAdSet', requiresApproval: true },
    { skill: 'createMetaAdsAdCreative', requiresApproval: true },
    { skill: 'createMetaAdsAd', requiresApproval: true },
    { skill: 'setMetaAdsStatus', requiresApproval: true },
  ],
  Alaric: [
    { skill: 'getMetaAdsAccountInsights', requiresApproval: false },
    { skill: 'getMetaAdsCampaignInsights', requiresApproval: false },
    { skill: 'listMetaAdsCampaigns', requiresApproval: false },
    { skill: 'listInstagramMedia', requiresApproval: false },
    { skill: 'analyzeInstagramMedia', requiresApproval: false },
  ],
  // Orla não tem skill de banco: ela usa a tool BUILTIN generateMarketingImage
  // (auto-disponível pra WORKER) + escreve a copy ela mesma. Sem entrada aqui.
  Caspian: [
    // Publicação — todos os formatos do Instagram (staging não-gated; o
    // passo público é publishInstagramMedia, gated) + Google Business
    { skill: 'createInstagramMediaContainer', requiresApproval: false }, // feed (imagem)
    { skill: 'createInstagramReel', requiresApproval: false }, // reels/vídeo
    { skill: 'createInstagramStory', requiresApproval: false }, // story
    { skill: 'createInstagramCarouselItem', requiresApproval: false }, // carrossel (item)
    { skill: 'createInstagramCarouselContainer', requiresApproval: false }, // carrossel (container)
    { skill: 'getInstagramContainerStatus', requiresApproval: false }, // status (reels/vídeo)
    { skill: 'publishInstagramMedia', requiresApproval: true }, // passo público (todos os formatos)
    { skill: 'createGoogleBusinessPost', requiresApproval: true },
    // Comunidade / reputação (responder comentários IG + reviews Google)
    { skill: 'listInstagramComments', requiresApproval: false },
    { skill: 'replyToInstagramComment', requiresApproval: true },
    { skill: 'sendInstagramDirectMessage', requiresApproval: true }, // DM texto/link
    { skill: 'sendInstagramDirectMedia', requiresApproval: true }, // DM arquivo
    { skill: 'listGoogleBusinessReviews', requiresApproval: false },
    { skill: 'replyToGoogleBusinessReview', requiresApproval: true },
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

    // 0) Limpeza: a geração de imagem virou tool BUILTIN. Remove resíduos de
    //    versões anteriores deste seed (tool "OpenAI Images" + skill HTTP
    //    "generateMarketingImage" + vínculos), pra não colidir com a builtin.
    await cleanupLegacyImageArtifacts(org.id);

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

async function cleanupLegacyImageArtifacts(organizationId) {
  const skill = await prisma.aiSkill.findFirst({
    where: { organizationId, name: 'generateMarketingImage', deletedAt: null },
    select: { id: true },
  });
  if (skill) {
    await prisma.aiAgentSkill.deleteMany({ where: { skillId: skill.id } });
    await prisma.aiSkill.update({
      where: { id: skill.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    console.log('  limpeza: skill HTTP generateMarketingImage removida (virou builtin)');
  }
  const tool = await prisma.aiTool.findFirst({
    where: { organizationId, name: 'OpenAI Images', deletedAt: null },
    select: { id: true },
  });
  if (tool) {
    await prisma.aiTool.update({
      where: { id: tool.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    console.log('  limpeza: tool OpenAI Images removida (geração agora é builtin)');
  }
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
