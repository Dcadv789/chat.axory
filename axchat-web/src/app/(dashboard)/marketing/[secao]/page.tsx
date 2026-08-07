'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { MarketingPanel } from '@/features/marketing/components/marketing-panel';
import { isMarketingSection } from '@/features/marketing/marketing-tabs';

/**
 * Uma seção do marketing: `/marketing/resumo`, `/marketing/conteudo`,
 * `/marketing/anuncios`. Seção é rota pra que o clique na sidebar seja
 * navegação de verdade — como query param, a página não trocava.
 */
export default function MarketingSecaoPage({
  params,
}: {
  params: Promise<{ secao: string }>;
}) {
  const { secao } = use(params);
  if (!isMarketingSection(secao)) notFound();
  return <MarketingPanel secao={secao} />;
}
