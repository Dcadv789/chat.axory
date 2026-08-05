'use client';

import Link from 'next/link';
import { ChevronRight, Home, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  /** Ícone da página (lucide) — aparece ao lado do título, na cor primary. */
  icon: LucideIcon;
  /** Título da página. Também vira o último item do breadcrumb. */
  title: string;
  /** Descrição curta abaixo do título. */
  subtitle?: string;
  /** Itens do breadcrumb ENTRE "Início" e o título (ex.: [{ label: 'Configurações', href: '/settings' }]). */
  breadcrumb?: BreadcrumbItem[];
  /** Botões/ações da página — renderizados à direita na barra fixa do topo
   *  (não no bloco de título), pra manter o container do título idêntico em toda página. */
  actions?: ReactNode;
  /** Conteúdo da página. Por padrão vem num container com rolagem vertical. */
  children?: ReactNode;
  /**
   * Sobrescreve o wrapper de conteúdo. Use para layouts especiais
   * (kanban com rolagem horizontal, chat de altura fixa, etc.).
   * Padrão: `flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3`.
   */
  contentClassName?: string;
}

/**
 * Cabeçalho padrão das páginas do app.
 *
 * Estrutura:
 *  1. Barra fixa (h-16) no topo com o breadcrumb — sempre começa em "Início"
 *     (link para o dashboard), com ícone só no "Início".
 *  2. Bloco de título abaixo, como conteúdo: container branco (light) / preto (dark),
 *     borda fina `border-zinc-200 dark:border-white/10`, cantos `rounded-lg`,
 *     com o ícone da página + título + subtítulo.
 *  3. Área de conteúdo (children) com rolagem.
 *
 * Ver CLAUDE.md → "Padrão de header das páginas".
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  breadcrumb = [],
  actions,
  children,
  contentClassName,
}: PageHeaderProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Barra fixa: breadcrumb de navegação (Início → ... → título) */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 dark:border-white/10 dark:bg-black">
        <nav aria-label="breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <Link
            href="/dashboard"
            className="inline-flex shrink-0 items-center gap-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <Home className="h-4 w-4" />
            Início
          </Link>
          {breadcrumb.map((crumb) => (
            <span key={crumb.label} className="flex min-w-0 items-center gap-2">
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{crumb.label}</span>
              )}
            </span>
          ))}
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
          <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
        </nav>
        {/* Ações da página ficam na barra fixa (altura constante h-16) — assim o
            bloco de título abaixo é IDÊNTICO em todas as páginas, sem variação. */}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>

      <div className={contentClassName ?? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3'}>
        {/* Bloco de título — branco no light / preto no dark, borda fina, cantos rounded-lg.
            Só ícone + título + subtítulo → mesmo tamanho em toda página. */}
        <div className="mb-3 shrink-0 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black">
          <div className="flex items-center gap-2.5">
            <Icon className="h-5 w-5 shrink-0 text-primary" />
            <h1 className="min-w-0 truncate text-xl font-semibold leading-tight text-zinc-950 dark:text-zinc-50">
              {title}
            </h1>
          </div>
          {subtitle && <p className="mt-1 truncate text-sm text-zinc-500">{subtitle}</p>}
        </div>

        {children}
      </div>
    </div>
  );
}
