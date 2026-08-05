# AxChat Web — convenções de UI

Next.js 16 (App Router, Turbopack) + Tailwind. Paleta **zinc**, token `primary`, dark mode via `dark:`.
Fundo "absoluto": `bg-white` no light / `bg-black` no dark. Borda fina padrão: `border-zinc-200 dark:border-white/10`.

## Padrão de header das páginas

**Toda página de conteúdo usa o componente `PageHeader`** (`@/components/layout/page-header`).
Ele é a fonte da verdade do cabeçalho — não recrie header/breadcrumb na mão.

```tsx
import { PageHeader } from '@/components/layout/page-header';
import { Send } from 'lucide-react';

<PageHeader
  icon={Send}                                   // ícone da página (lucide) — fica ao lado do título, em text-primary
  title="Campanhas"                             // também vira o último item do breadcrumb
  subtitle="Dispare mensagens em massa…"        // opcional
  breadcrumb={[{ label: 'Configurações', href: '/settings' }]}  // opcional: itens ENTRE "Início" e o título
  actions={<button …>Nova campanha</button>}    // opcional: botões à direita, dentro do bloco de título
>
  {/* conteúdo da página */}
</PageHeader>
```

### Anatomia (o que o componente renderiza)
1. **Barra fixa (`h-16`, `shrink-0`)** no topo com o **breadcrumb** (esquerda) e as **`actions`** (direita):
   - Sempre começa em **Início** (link para `/dashboard`), e **só o "Início" tem ícone** (`Home`).
   - Os demais itens **não têm ícone**; separador é `ChevronRight`.
   - Último item = `title` (não é link).
   - `actions` (botões/busca da página) ficam à direita **nesta barra** — nunca dentro do bloco de título.
   - Borda inferior `border-b border-zinc-200 dark:border-white/10`, fundo branco/preto.
2. **Bloco de título** (abaixo da barra, como conteúdo — `shrink-0`):
   - Container: `rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-black`.
     Borda **fina** (igual aos demais botões/cards); cantos `rounded-lg` (não `rounded-xl`).
   - **Só** ícone da página (`h-5 w-5 text-primary`) + `<h1>` (`text-xl font-semibold text-zinc-950 dark:text-zinc-50` + `truncate`)
     + `subtitle` (`text-sm text-zinc-500` + `truncate`).
   - **É IDÊNTICO em toda página** — mesmo tamanho, fonte e altura. Não coloque botões/ações aqui
     (isso "estica" o container e quebra a consistência). Referência correta: rota `/settings`.
3. **Área de conteúdo** (`children`): por padrão rola na vertical
   (`flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3`).

### Espaçamento
Padding lateral do app é **`px-4`** (não `px-6`) — conteúdo mais colado à sidebar.
Vertical `py-3`. Entre o bloco de título e o conteúdo, `mb-3` no título.

### Breadcrumb
- Página de topo (dashboard, campanhas, chatbot, pipelines, super-admin, marketing): **omita** `breadcrumb`
  → fica `Início › Título`.
- Sub-página / aba (ex.: Configurações, detalhe de pipeline): passe os intermediários
  → `Início › Configurações › Aba`.

### Layouts especiais (full-height)
Para páginas que precisam de altura cheia / rolagem própria (kanban, painéis com abas), use
`contentClassName` para sobrescrever o wrapper de conteúdo e deixe o filho gerenciar o scroll.
Ex. (kanban): `contentClassName="flex min-h-0 flex-1 flex-col px-4 pt-3"` e o board com
`className="-mx-4 min-h-0 flex-1 overflow-hidden"` (o `-mx-4` sangra o conteúdo até as bordas).
Veja `pipelines/[id]/page.tsx`, `ai-agents/page.tsx` e `marketing-panel.tsx`.

### Exceções (NÃO usam PageHeader)
Workspaces/editores full-screen com chrome próprio: **Inbox** (chat de 3 painéis) e o
**editor de fluxo do Chatbot** (`chatbot/[id]`, canvas ReactFlow com toolbar própria).

### Ícone dinâmico
Quando o ícone vem de um mapa tipado como `React.ElementType` (ex.: abas), faça cast:
`icon={meta.icon as LucideIcon}`.
