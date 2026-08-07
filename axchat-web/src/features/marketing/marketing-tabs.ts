import {
  Activity,
  BarChart3,
  Instagram,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  PenSquare,
  UserCircle2,
  type LucideIcon,
} from 'lucide-react';
import { ThreadsIcon } from '@/components/icons/threads-icon';

/**
 * Ícone de menu. Aceita os do lucide E os nossos em SVG (Threads não existe no
 * lucide), porque as duas famílias convivem na mesma lista.
 */
export type IconeDeMenu =
  | LucideIcon
  | ((props: { className?: string }) => React.ReactElement);

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
  icon: IconeDeMenu;
  label: string;
  subtitle: string;
}

export interface MarketingSectionDef {
  id: MarketingSection;
  icon: IconeDeMenu;
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
 * A seção é SEGMENTO DE ROTA (`/marketing/conteudo`) e a aba é query param
 * (`?aba=posts`). A seção precisa ser rota porque é o que a sidebar navega —
 * como query, o clique só reescrevia o que vinha depois do `?` e a tela não
 * trocava.
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
        id: 'threads',
        icon: ThreadsIcon,
        label: 'Threads',
        subtitle:
          'Respostas, moderação e desempenho dos seus posts do Threads',
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

/** Nome do query param que carrega a aba (`/marketing/resumo?aba=conta`). */
export const MARKETING_TAB_PARAM = 'aba';

/** Aba de entrada quando a URL não diz nada. */
export const MARKETING_TAB_PADRAO: MarketingTab = 'resumo';

/**
 * A SEÇÃO é segmento de rota, não query param. Trocar de seção pela sidebar
 * precisa ser uma troca de página de verdade — com a seção na query, o clique
 * mexia só no que vinha depois do `?` e a tela ficava onde estava.
 */
export function rotaDaSecao(secao: MarketingSection): string {
  return `/marketing/${secao}`;
}

export function isMarketingSection(v: string | null): v is MarketingSection {
  return !!v && MARKETING_SECTIONS.some((s) => s.id === v);
}

export function acharSecao(v: string | null): MarketingSectionDef {
  return MARKETING_SECTIONS.find((s) => s.id === v) ?? MARKETING_SECTIONS[0];
}

const TODAS = MARKETING_SECTIONS.flatMap((s) =>
  s.tabs.map((t) => ({ tab: t, secao: s })),
);

export function isMarketingTab(value: string | null): value is MarketingTab {
  return !!value && TODAS.some((x) => x.tab.id === value);
}

/**
 * Aba ativa DENTRO de uma seção. Aba de outra seção é ignorada — a URL manda
 * na seção, e obedecer os dois lados deixaria a barra do topo destacando uma
 * aba que ela nem exibe.
 */
export function resolveAbaDaSecao(
  secao: MarketingSectionDef,
  value: string | null,
): MarketingTabDef {
  return secao.tabs.find((t) => t.id === value) ?? secao.tabs[0];
}

/** Primeira aba da seção — é onde o clique na sidebar cai. */
export function primeiraAbaDaSecao(secao: MarketingSectionDef): MarketingTab {
  return secao.tabs[0].id;
}
