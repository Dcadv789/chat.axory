import {
  Activity,
  BarChart3,
  Instagram,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  PenSquare,
  AtSign,
  UserCircle2,
  type LucideIcon,
} from 'lucide-react';

export type MarketingTab =
  | 'resumo'
  | 'conta'
  | 'activity'
  | 'publicar'
  | 'posts'
  | 'comentarios'
  | 'metrics'
  | 'threads'
  | 'gestao'
  | 'admetrics';

export type MarketingSection = 'resumo' | 'conteudo' | 'anuncios';

export interface MarketingTabDef {
  id: MarketingTab;
  icon: LucideIcon;
  label: string;
  subtitle: string;
}

export interface MarketingSectionDef {
  id: MarketingSection;
  icon: LucideIcon;
  label: string;
  tabs: MarketingTabDef[];
}

/**
 * Navegação do marketing em DOIS níveis: a sidebar escolhe a seção, a barra do
 * topo escolhe a aba dentro dela.
 *
 * Antes as dez abas apareciam inteiras nos dois lugares — a sidebar repetia,
 * item por item, a mesma barra que já estava na tela. Com a divisão, a sidebar
 * responde "que parte do marketing eu quero" e a barra responde "o que eu faço
 * aqui dentro".
 *
 * A URL carrega só a aba (`?aba=`); a seção é deduzida dela. Guardar as duas
 * abriria espaço pra estado incoerente (seção A com aba da seção B).
 */
export const MARKETING_SECTIONS: MarketingSectionDef[] = [
  {
    id: 'resumo',
    icon: LayoutDashboard,
    label: 'Resumo',
    tabs: [
      {
        id: 'resumo',
        icon: LayoutDashboard,
        label: 'Visão geral',
        subtitle: 'Verba do mês, desempenho da conta e campanhas num olhar',
      },
      {
        id: 'conta',
        icon: UserCircle2,
        label: 'Conta',
        subtitle: 'Perfil do Instagram: foto, bio, seguidores e publicações',
      },
      {
        id: 'activity',
        icon: Activity,
        label: 'Atividade da crew',
        subtitle: 'Análises e ações registradas pelos agentes',
      },
    ],
  },
  {
    id: 'conteudo',
    icon: PenSquare,
    label: 'Conteúdo',
    // Na ordem do trabalho: publica, vê o que publicou, responde quem
    // comentou, mede. Threads fecha porque é o mesmo ciclo em outra rede.
    tabs: [
      {
        id: 'publicar',
        icon: PenSquare,
        label: 'Publicar',
        subtitle: 'Crie e publique posts no Instagram e no Threads',
      },
      {
        id: 'posts',
        icon: Instagram,
        label: 'Posts do Instagram',
        subtitle: 'Seus posts recentes com miniatura e engajamento',
      },
      {
        id: 'comentarios',
        icon: MessageCircle,
        label: 'Comentários',
        subtitle:
          'Veja e responda os comentários de cada post — e acompanhe a automação agindo',
      },
      {
        id: 'metrics',
        icon: BarChart3,
        label: 'Métricas dos posts',
        subtitle: 'Engajamento dos posts do Instagram',
      },
      {
        id: 'threads',
        icon: AtSign,
        label: 'Threads',
        subtitle:
          'Respostas, moderação e desempenho dos seus posts do Threads',
      },
    ],
  },
  {
    id: 'anuncios',
    icon: Megaphone,
    label: 'Anúncios',
    tabs: [
      {
        id: 'gestao',
        icon: Megaphone,
        label: 'Gestão de anúncios',
        subtitle: 'Pause, ative e exclua suas campanhas do Meta Ads',
      },
      {
        id: 'admetrics',
        icon: BarChart3,
        label: 'Métricas dos anúncios',
        subtitle: 'Desempenho por campanha ao longo do tempo',
      },
    ],
  },
];

/** Nome do query param que carrega a aba (`/marketing?aba=conta`). */
export const MARKETING_TAB_PARAM = 'aba';

/** Aba de entrada quando a URL não diz nada. */
export const MARKETING_TAB_PADRAO: MarketingTab = 'resumo';

const TODAS = MARKETING_SECTIONS.flatMap((s) =>
  s.tabs.map((t) => ({ tab: t, secao: s })),
);

export function isMarketingTab(value: string | null): value is MarketingTab {
  return !!value && TODAS.some((x) => x.tab.id === value);
}

/** A aba e a seção dona dela. Cai no padrão quando a URL traz lixo. */
export function resolveMarketingTab(value: string | null): {
  tab: MarketingTabDef;
  secao: MarketingSectionDef;
} {
  const alvo = isMarketingTab(value) ? value : MARKETING_TAB_PADRAO;
  const achado = TODAS.find((x) => x.tab.id === alvo);
  // O `!` é seguro: MARKETING_TAB_PADRAO é uma aba da primeira seção.
  return achado ?? TODAS[0]!;
}

/** Primeira aba da seção — é onde o clique na sidebar cai. */
export function primeiraAbaDaSecao(secao: MarketingSectionDef): MarketingTab {
  return secao.tabs[0].id;
}
