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
  | 'publicar'
  | 'posts'
  | 'comentarios'
  | 'metrics'
  | 'threads'
  | 'gestao'
  | 'admetrics'
  | 'activity';

export interface MarketingTabDef {
  id: MarketingTab;
  icon: LucideIcon;
  label: string;
  subtitle: string;
  /** Cabeçalho do bloco na sidebar. Só o primeiro item do bloco carrega. */
  group?: string;
}

/**
 * Fonte única das abas do marketing: o painel monta a navegação em pílula com
 * isto, e a árvore da sidebar monta o submenu com o mesmo array. Antes a lista
 * vivia só dentro do painel — duplicar aqui deixaria os dois menus divergindo
 * na primeira aba nova.
 *
 * A ordem é a da tela, e `group` fatia em blocos: panorama primeiro, depois o
 * que se faz com conteúdo, depois onde entra dinheiro, e a IA por último.
 */
export const MARKETING_TABS: MarketingTabDef[] = [
  {
    id: 'resumo',
    icon: LayoutDashboard,
    label: 'Resumo',
    subtitle: 'Verba do mês, desempenho da conta e campanhas num olhar',
  },
  {
    id: 'conta',
    icon: UserCircle2,
    label: 'Conta',
    subtitle: 'Perfil do Instagram: foto, bio, seguidores e publicações',
  },
  {
    id: 'publicar',
    icon: PenSquare,
    label: 'Publicar',
    subtitle: 'Crie e publique posts no Instagram e no Threads',
    group: 'Conteúdo',
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
    subtitle: 'Respostas, moderação e desempenho dos seus posts do Threads',
  },
  {
    id: 'gestao',
    icon: Megaphone,
    label: 'Gestão de anúncios',
    subtitle: 'Pause, ative e exclua suas campanhas do Meta Ads',
    group: 'Anúncios',
  },
  {
    id: 'admetrics',
    icon: BarChart3,
    label: 'Métricas dos anúncios',
    subtitle: 'Desempenho por campanha ao longo do tempo',
  },
  {
    id: 'activity',
    icon: Activity,
    label: 'Atividade da crew',
    subtitle: 'Análises e ações registradas pelos agentes',
    group: 'Inteligência',
  },
];

export const MARKETING_TAB_IDS = MARKETING_TABS.map((t) => t.id);

/** Nome do query param que carrega a aba (`/marketing?aba=conta`). */
export const MARKETING_TAB_PARAM = 'aba';

export function isMarketingTab(value: string | null): value is MarketingTab {
  return !!value && (MARKETING_TAB_IDS as string[]).includes(value);
}
