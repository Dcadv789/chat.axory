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
    httpBaseUrl: 'https://graph.facebook.com/v25.0',
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
      'Lê uma mídia específica do Instagram com métricas de engajamento (alcance, salvos, comentários, curtidas, etc).',
    promptInstructions:
      'Use quando o usuário pedir análise de performance de um post específico do Instagram. Requer o mediaId (id da mídia retornado pela Graph API). Métricas via campo `metrics` (CSV): padrão "reach,likes,comments,saved,shares,total_interactions". IMPORTANTE: NÃO use "impressions" — a Meta removeu essa métrica das insights de mídia e qualquer chamada que a inclua retorna erro 400. Para vídeos/Reels existe "views" (que substituiu impressions/plays). Tipo de mídia muda quais métricas existem, então em caso de erro 400 reduza para "reach,likes,comments,saved".',
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
            'Lista CSV de métricas de insights de mídia. Válidas atuais: reach, likes, comments, saved, shares, total_interactions (e views para vídeos/Reels). NÃO inclua "impressions" — foi removida pela Meta e causa erro 400.',
          default: 'reach,likes,comments,saved,shares,total_interactions',
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

  // (2.c) Reels / vídeo — cria o container (processamento é assíncrono)
  {
    toolName: 'Instagram',
    name: 'createInstagramReel',
    category: 'Marketing/Instagram',
    description:
      'Cria um container de REELS (vídeo) no Instagram. O vídeo é processado de forma assíncrona; cheque o status com getInstagramContainerStatus antes de publicar.',
    promptInstructions:
      'Fluxo de Reels: (1) createInstagramReel com videoUrl (URL pública .mp4) + caption → creationId; (2) getInstagramContainerStatus até status_code=FINISHED; (3) publishInstagramMedia com o creationId. A conta já está pré-configurada (env IG_USER_ID). Não publique antes de FINISHED.',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media',
    httpBodyTemplate:
      '{"media_type":"REELS","video_url":{{json:input.videoUrl}},"caption":{{json:input.caption}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', creationId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: 'URL pública do vídeo (.mp4) acessível à Meta.' },
        caption: { type: 'string', description: 'Legenda do reel (hashtags e quebras de linha ok).' },
      },
      required: ['videoUrl', 'caption'],
      additionalProperties: false,
    },
  },

  // (2.d) Story — cria o container de story (imagem)
  {
    toolName: 'Instagram',
    name: 'createInstagramStory',
    category: 'Marketing/Instagram',
    description:
      'Cria um container de STORY (imagem) no Instagram. Publique com publishInstagramMedia.',
    promptInstructions:
      'Fluxo de Story: (1) createInstagramStory com imageUrl (URL pública da Orla) → creationId; (2) publishInstagramMedia com o creationId. A conta já está pré-configurada (env IG_USER_ID). Story não tem legenda no feed.',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media',
    httpBodyTemplate:
      '{"media_type":"STORIES","image_url":{{json:input.imageUrl}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', creationId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL pública da imagem do story.' },
      },
      required: ['imageUrl'],
      additionalProperties: false,
    },
  },

  // (2.e) Carrossel — passo A: cria cada item
  {
    toolName: 'Instagram',
    name: 'createInstagramCarouselItem',
    category: 'Marketing/Instagram',
    description:
      'Cria UM item de carrossel (imagem). Repita por imagem; junte os ids com createInstagramCarouselContainer.',
    promptInstructions:
      'Carrossel tem 3 passos: (1) createInstagramCarouselItem por imagem (2 a 10 itens) → guarde cada itemId; (2) createInstagramCarouselContainer com a lista de ids + caption → creationId; (3) publishInstagramMedia. A conta já está pré-configurada (env IG_USER_ID).',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media',
    httpBodyTemplate:
      '{"image_url":{{json:input.imageUrl}},"is_carousel_item":true,"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', itemId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        imageUrl: { type: 'string', description: 'URL pública da imagem do item.' },
      },
      required: ['imageUrl'],
      additionalProperties: false,
    },
  },

  // (2.f) Carrossel — passo B: agrupa os itens
  {
    toolName: 'Instagram',
    name: 'createInstagramCarouselContainer',
    category: 'Marketing/Instagram',
    description:
      'Cria o container do carrossel a partir dos ids dos itens (2 a 10). Publique com publishInstagramMedia.',
    promptInstructions:
      'Passe children como um array JSON de itemIds (ex: ["178...","178..."]) obtidos de createInstagramCarouselItem, mais a caption. Retorna creationId pra publishInstagramMedia. A conta já está pré-configurada (env IG_USER_ID).',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/media',
    httpBodyTemplate:
      '{"media_type":"CAROUSEL","children":{{input.children}},"caption":{{json:input.caption}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', creationId: '$.id' },
    parameters: {
      type: 'object',
      properties: {
        children: {
          type: 'string',
          description: 'Array JSON de itemIds, ex: ["178...","178..."] (2 a 10).',
        },
        caption: { type: 'string', description: 'Legenda do carrossel.' },
      },
      required: ['children', 'caption'],
      additionalProperties: false,
    },
  },

  // (2.g) Status do container (necessário pra Reels/vídeo antes de publicar)
  {
    toolName: 'Instagram',
    name: 'getInstagramContainerStatus',
    category: 'Marketing/Instagram',
    description:
      'Lê o status de processamento de um container de mídia (status_code). Use em Reels/vídeo: só publique quando FINISHED.',
    promptInstructions:
      'Cheque o status_code de um creationId antes de publicar vídeo/Reels: IN_PROGRESS = aguarde e cheque de novo; FINISHED = pode publishInstagramMedia; ERROR = falhou, não publique. Skill de LEITURA.',
    httpMethod: 'GET',
    httpPath: '/{{input.containerId}}?fields=status_code,status&access_token={{env.IG_ACCESS_TOKEN}}',
    httpBodyTemplate: null,
    responseMap: { ok: '$.ok', status: '$.status', statusCode: '$.status_code' },
    parameters: {
      type: 'object',
      properties: {
        containerId: {
          type: 'string',
          description: 'creationId do container (de createInstagramReel/Story/Carousel).',
        },
      },
      required: ['containerId'],
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

  // (3.b) Enviar DM (texto/link) no Instagram — automação pós-comentário
  {
    toolName: 'Instagram',
    name: 'sendInstagramDirectMessage',
    category: 'Marketing/Instagram',
    description:
      'Envia uma mensagem direta (DM) de texto no Instagram para um usuário. Use o link dentro do texto. Requer o recipientId (IGSID do usuário, vindo do comentário/DM).',
    promptInstructions:
      'Automação típica: quando alguém comenta, voce responde o comentario (replyToInstagramComment) E manda uma DM com o material/link (esta skill). recipientId é o IGSID do usuário (vem do evento de comentário/DM — NÃO é o @username). A conta já está pré-configurada (env IG_USER_ID). Só mande DM se houver gancho real (o usuário pediu/comentou); nada de spam. Inclua o link dentro do texto.',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/messages',
    httpBodyTemplate:
      '{"recipient":{"id":{{json:input.recipientId}}},"message":{"text":{{json:input.text}}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', messageId: '$.message_id' },
    parameters: {
      type: 'object',
      properties: {
        recipientId: {
          type: 'string',
          description: 'IGSID do destinatário (vem do evento de comentário/DM).',
        },
        text: {
          type: 'string',
          description: 'Texto da DM. Coloque o link aqui dentro, se houver.',
        },
      },
      required: ['recipientId', 'text'],
      additionalProperties: false,
    },
  },

  // (3.c) Enviar arquivo/mídia por DM no Instagram (imagem, vídeo, doc)
  {
    toolName: 'Instagram',
    name: 'sendInstagramDirectMedia',
    category: 'Marketing/Instagram',
    description:
      'Envia um arquivo/mídia (imagem, vídeo, áudio) por DM no Instagram via URL pública. Use pra entregar um material após um comentário.',
    promptInstructions:
      'Use pra mandar um ARQUIVO na DM (ex: PDF/imagem do material que o usuário pediu no comentário). recipientId é o IGSID do usuário; attachmentType é image/video/audio; attachmentUrl é a URL pública do arquivo (ex: a hospedada pela Orla/MinIO). A conta já está pré-configurada (env IG_USER_ID). Só envie com gancho real (o usuário pediu).',
    httpMethod: 'POST',
    httpPath: '/{{env.IG_USER_ID}}/messages',
    httpBodyTemplate:
      '{"recipient":{"id":{{json:input.recipientId}}},"message":{"attachment":{"type":{{json:input.attachmentType}},"payload":{"url":{{json:input.attachmentUrl}}}}},"access_token":"{{env.IG_ACCESS_TOKEN}}"}',
    responseMap: { ok: '$.ok', status: '$.status', messageId: '$.message_id' },
    parameters: {
      type: 'object',
      properties: {
        recipientId: {
          type: 'string',
          description: 'IGSID do destinatário (vem do evento de comentário/DM).',
        },
        attachmentType: {
          type: 'string',
          description: 'Tipo do anexo.',
          enum: ['image', 'video', 'audio'],
        },
        attachmentUrl: {
          type: 'string',
          description: 'URL pública do arquivo a enviar.',
        },
      },
      required: ['recipientId', 'attachmentType', 'attachmentUrl'],
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

  // Skills de marketing (IG/Google) só pra orgs com o add-on. SEED_ORG_ID
  // escopa a uma org (auto-provisionamento on-enable).
  const orgWhere = process.env.SEED_ORG_ID
    ? { id: process.env.SEED_ORG_ID, deletedAt: null, marketingEnabled: true }
    : { deletedAt: null, marketingEnabled: true };
  const organizations = await prisma.organization.findMany({
    where: orgWhere,
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
