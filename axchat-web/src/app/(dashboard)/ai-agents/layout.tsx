/**
 * Server Component só pra marcar a rota como dinâmica. Mesmo motivo do
 * `inbox/layout.tsx`: a sidebar troca de aba e de setor mexendo só na query
 * (`/ai-agents?tab=…&sector=…`), e numa rota pré-renderizada o router
 * reaproveita o payload em cache — o clique não muda nada.
 *
 * Não dá pra declarar isto na própria page porque ela é `'use client'`, e o
 * Next só lê configuração de segmento em Server Component.
 */
export const dynamic = 'force-dynamic';

export default function AiAgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
