'use client';

import { MarketingPanel } from '@/features/marketing/components/marketing-panel';

/**
 * `/marketing` sem seção abre o Resumo. Não redireciona: quem chega por link
 * antigo (ou pelo cabeçalho da sidebar) veria a URL trocar sozinha debaixo do
 * dedo. A seção fica implícita e a sidebar destaca o Resumo do mesmo jeito.
 */
export default function MarketingPage() {
  return <MarketingPanel secao="resumo" />;
}
