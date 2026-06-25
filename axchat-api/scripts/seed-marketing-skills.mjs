import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '..');

loadEnv(path.join(apiRoot, '.env'));

const prisma = new PrismaClient();

// ─── Tools ─────────────────────────────────────────────────────

const tools = [
  {
    name: 'Instagram',
    description:
      'Instagram Graph API (Meta) — leitura de mídias/insights, publicação de posts e gestão de comentários da conta business conectada.',
    source: 'CUSTOM_HTTP',
    httpBaseUrl: 'https://graph.facebook.com/v21.0',
    httpHeaders: {
      Authorization: 'Bearer {{env.IG_ACCESS_TOKEN}}',
      'Content-Type': 'application/json',
    },
  },
  {
    name: 'Google Business',
    description:
      'Google Business Profile API — gestão de posts (localPosts) e reviews da localização conectada.',
    source: 'CUSTOM_HTTP',
    httpBaseUrl: 'https://mybusiness.googleapis.com/v4',
    httpHeaders: {
      Authorization: 'Bearer {{env.GBP_ACCESS_TOKEN}}',
      'Content-Type': 'application/json',
    },
  },
];

// ─── Skills ────────────────────────────────────────────────────

const skills = [
  // (1) Analisar mídia/insights Instagram
  {
    toolName: 'Instagram',
    name: 'analyzeInstagramMedia',
    category: 'Marketing/Instagram',
    description:
      'Lê uma mídia específica do Instagram com métricas de engajamento (impressões, alcance, salvos, comentários, etc).',
    promptInstructions:
      'Use quando o usuário pedir análise de performance de um post específico do Instagram. Requer o mediaId (id da mídia retornado pela Graph API). Métricas pedidas via campo `metric`: padrão "impressions,reach,saved,comments,likes,shares". Tipo de mídia muda quais métricas existem (Reels tem plays, foto não), então peça o tipo se não souber.',
    httpMethod: 'GET',
    httpPath:
      '/{{input.mediaId}}/insights?metric={{input.metrics}}&access_token={{env.IG_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      insights: '$.data',
    },
    parameters: {
      type: 'object',
      properties: {
        mediaId: {
          type: 'string',
          description: 'ID da mídia no Instagram (obtido via /me/media).',
        },
        metrics: {
          type: 'string',
          description:
            'Lista CSV de métricas (ex: "impressions,reach,saved,comments,likes,shares"). Padrão coerente com posts de feed.',
          default: 'impressions,reach,saved,comments,likes,shares',
        },
      },
      required: ['mediaId', 'metrics'],
      additionalProperties: false,
    },
  },

  // (2.a) Criar container de mídia do Instagram (passo 1 de publicação)
  {
    toolName: 'Instagram',
    name: 'createInstagramMediaContainer',
    category: 'Marketing/Instagram',
    description:
      'Cria um container de mídia no Instagram (passo 1/2 da publicação). Retorna um creationId que deve ser passado pra publishInstagramMedia.',
    promptInstructions:
      'Publicar post no Instagram é um fluxo de 2 etapas: (1) chame esta skill com imageUrl (URL pública, ex: a que a Orla gerou) + caption; (2) pegue o `creationId` do retorno e passe pra `publishInstagramMedia`. A conta do Instagram já está pré-configurada na org (env IG_USER_ID) — não peça o ID. NÃO publique automaticamente após criar o container sem confirmar com o usuário, exceto se ele já deu OK explícito. Caption suporta hashtags e quebras de linha.',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media',
    httpBodyTemplate:
      '{"image_url":{{json:input.imageUrl}},"caption":{{json:input.caption}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      creationId: '$.id',
    },
    parameters: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description:
            'URL pública da imagem a publicar. Deve estar acessível à Meta (não localhost).',
        },
        caption: {
          type: 'string',
          description:
            'Legenda do post, com hashtags e quebras de linha. Pode estar vazia.',
        },
      },
      required: ['imageUrl', 'caption'],
      additionalProperties: false,
    },
  },

  // (2.b) Publicar o container — passo 2
  {
    toolName: 'Instagram',
    name: 'publishInstagramMedia',
    category: 'Marketing/Instagram',
    description:
      'Publica um container previamente criado por createInstagramMediaContainer. Passo 2/2 do fluxo de publicação no feed.',
    promptInstructions:
      'Só chame esta skill DEPOIS de criar o container via `createInstagramMediaContainer` e ter o creationId em mãos. A conta já está pré-configurada na org (env IG_USER_ID). Esta é a ação que efetivamente faz o post aparecer no perfil — peça confirmação explícita ao usuário antes se a skill não estiver gateada por aprovação.',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media_publish',
    httpBodyTemplate:
      '{"creation_id":{{json:input.creationId}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      publishedId: '$.id',
    },
    parameters: {
      type: 'object',
      properties: {
        creationId: {
          type: 'string',
          description: 'creationId retornado por createInstagramMediaContainer.',
        },
      },
      required: ['creationId'],
      additionalProperties: false,
    },
  },

  // (3) Responder/comentar em posts do Instagram
  {
    toolName: 'Instagram',
    name: 'replyToInstagramComment',
    category: 'Marketing/Instagram',
    description:
      'Responde a um comentário em um post do Instagram. Cria uma resposta encadeada (reply) ao commentId informado.',
    promptInstructions:
      'Use quando o usuário pedir pra responder um comentário específico no Instagram. Requer o commentId (id do comentário original). Mensagem deve ser cordial e em PT-BR; nunca prometa preço, prazo ou condições sem confirmação humana. Não cite link externo sem OK do usuário.',
    httpMethod: 'POST',
    httpPath: '/{{input.commentId}}/replies',
    httpBodyTemplate:
      '{"message":{{json:input.message}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      replyId: '$.id',
    },
    parameters: {
      type: 'object',
      properties: {
        commentId: {
          type: 'string',
          description: 'ID do comentário original a ser respondido.',
        },
        message: {
          type: 'string',
          description:
            'Texto da resposta. Suporta quebras de linha e emojis. Mantenha tom cordial.',
        },
      },
      required: ['commentId', 'message'],
      additionalProperties: false,
    },
  },

  // (4.a) Criar post no Google Business
  {
    toolName: 'Google Business',
    name: 'createGoogleBusinessPost',
    category: 'Marketing/GoogleBusiness',
    description:
      'Cria um post (localPost) numa localização do Google Business Profile. Tipo padrão STANDARD com summary obrigatório.',
    promptInstructions:
      'Use quando o usuário pedir pra publicar um post no perfil do Google Business. A conta e a localização já estão pré-configuradas na org (env GBP_ACCOUNT_ID e GBP_LOCATION_ID) — não peça esses IDs. Summary é o texto principal (até 1500 chars). topicType padrão é STANDARD; OFFER e EVENT exigem campos extras que esta skill não cobre — pra esses casos avise o usuário e devolva ao humano.',
    httpMethod: 'POST',
    httpPath: '/accounts/{{env.GBP_ACCOUNT_ID}}/locations/{{env.GBP_LOCATION_ID}}/localPosts',
    httpBodyTemplate:
      '{"languageCode":"pt-BR","summary":{{json:input.summary}},"topicType":"STANDARD"}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      postName: '$.name',
    },
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Texto do post (até 1500 caracteres).',
        },
      },
      required: ['summary'],
      additionalProperties: false,
    },
  },

  // (4.b) Listar reviews
  {
    toolName: 'Google Business',
    name: 'listGoogleBusinessReviews',
    category: 'Marketing/GoogleBusiness',
    description:
      'Lista as avaliações (reviews) recebidas numa localização do Google Business Profile, ordenadas da mais recente pra mais antiga.',
    promptInstructions:
      'Use quando o usuário quiser ver as reviews recebidas — pra monitorar, classificar ou pedir resposta. A conta e a localização já estão pré-configuradas na org (env GBP_ACCOUNT_ID e GBP_LOCATION_ID). pageSize padrão 20, ordenação por updateTime desc. O reviewId retornado em cada item é o que `replyToGoogleBusinessReview` precisa.',
    httpMethod: 'GET',
    httpPath:
      '/accounts/{{env.GBP_ACCOUNT_ID}}/locations/{{env.GBP_LOCATION_ID}}/reviews?pageSize={{input.pageSize}}&orderBy=updateTime%20desc',
    httpBodyTemplate: null,
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      reviews: '$.reviews',
      averageRating: '$.averageRating',
      totalReviewCount: '$.totalReviewCount',
    },
    parameters: {
      type: 'object',
      properties: {
        pageSize: {
          type: 'integer',
          description: 'Quantas reviews trazer (1-50).',
          default: 20,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['pageSize'],
      additionalProperties: false,
    },
  },

  // (4.c) Responder review
  {
    toolName: 'Google Business',
    name: 'replyToGoogleBusinessReview',
    category: 'Marketing/GoogleBusiness',
    description:
      'Publica/atualiza a resposta do estabelecimento a uma review específica do Google Business Profile.',
    promptInstructions:
      'Use quando o usuário pedir pra responder uma review específica. A conta e a localização já estão pré-configuradas na org (env GBP_ACCOUNT_ID e GBP_LOCATION_ID); você só precisa do reviewId (vem de listGoogleBusinessReviews). Resposta tem que ser cordial e seguir as diretrizes do Google: sem dados pessoais do cliente, sem promessas comerciais, sem links suspeitos. Para reviews negativas, peça aprovação humana antes (não responda solo).',
    httpMethod: 'PUT',
    httpPath:
      '/accounts/{{env.GBP_ACCOUNT_ID}}/locations/{{env.GBP_LOCATION_ID}}/reviews/{{input.reviewId}}/reply',
    httpBodyTemplate: '{"comment":{{json:input.comment}}}',
    responseMap: {
      ok: '$.ok',
      status: '$.status',
      reply: '$.comment',
      updatedAt: '$.updateTime',
    },
    parameters: {
      type: 'object',
      properties: {
        reviewId: {
          type: 'string',
          description: 'ID da review (obtido via listGoogleBusinessReviews).',
        },
        comment: {
          type: 'string',
          description:
            'Texto da resposta. Cordial, em PT-BR, sem dados pessoais do cliente.',
        },
      },
      required: ['reviewId', 'comment'],
      additionalProperties: false,
    },
  },
];

// ─── Runner ────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não encontrado. Confira axchat-api/.env');
  }

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });

  if (organizations.length === 0) {
    throw new Error(
      'Nenhuma organização encontrada. Rode primeiro: npm run prisma:seed',
    );
  }

  for (const org of organizations) {
    console.log(`\nOrganização: ${org.name}`);

    const toolByName = new Map();
    for (const tool of tools) {
      const saved = await upsertTool(org.id, tool);
      toolByName.set(tool.name, saved);
      console.log(`  tool: ${saved.name}`);
    }

    for (const skill of skills) {
      const tool = toolByName.get(skill.toolName);
      if (!tool) {
        console.warn(`  pulando skill ${skill.name}: tool ${skill.toolName} não encontrada`);
        continue;
      }
      const saved = await upsertSkill(org.id, tool.id, skill);
      console.log(`  skill: ${saved.name}`);
    }
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
    return prisma.aiTool.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.aiTool.create({ data: payload });
}

async function upsertSkill(organizationId, toolId, data) {
  const existing = await prisma.aiSkill.findFirst({
    where: { organizationId, name: data.name, deletedAt: null },
    select: { id: true, currentVersion: true },
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
    return prisma.aiSkill.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.aiSkill.create({
    data: { ...payload, currentVersion: 1 },
  });
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
    console.error('Erro ao semear marketing skills:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
