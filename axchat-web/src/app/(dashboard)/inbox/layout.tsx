/**
 * Server Component só pra marcar a rota como dinâmica.
 *
 * A sidebar navega o inbox trocando SÓ a query (`/inbox?view=…`). Numa rota
 * pré-renderizada, o router do Next reaproveita o payload em cache e o clique
 * vira no-op — é o "às vezes troca, às vezes não" que aparecia na navegação.
 * O próprio InboxTree já tinha um comentário sobre isso, contornando com
 * `router.push` em vez de `<Link>`; o contorno ajuda, mas não elimina.
 *
 * Rotas que trocam de segmento (`/pipelines/[id]`, `/marketing/[secao]`) já
 * eram dinâmicas e nunca apresentaram o problema.
 *
 * A configuração de segmento não pode ficar na page: ela é `'use client'`, e o
 * Next só lê `dynamic` de Server Component. Por isso este layout existe.
 */
export const dynamic = 'force-dynamic';

export default function InboxLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
