# Manual do AxChat — Ajude-me

Guia completo das funções e integrações do AxChat. Serve de base para a central
de ajuda ("Ajude-me"). Organizado por área; cada seção pode virar um artigo.

> **O que é o AxChat:** uma plataforma de atendimento omnichannel + CRM com
> agentes de IA. Centraliza WhatsApp, Instagram e Telegram numa única caixa de
> entrada, com automações, funil de vendas, chatbot e agentes de IA que atendem,
> fazem marketing e — opcionalmente — um assistente pessoal do dono.

---

## 1. Primeiros passos

### Conta e organização
- **Cadastro:** cria seu usuário + a sua organização (empresa) de uma vez.
- **Login:** e-mail e senha. A sessão é por organização — se você participa de
  várias, troca pelo seletor no topo da barra lateral.
- **Multi-organização:** o mesmo usuário pode pertencer a várias empresas, com um
  papel diferente em cada.

### Papéis (permissões)
- **OWNER (Dono):** controle total — cobrança, exclusão da org, todas as configs.
- **ADMIN:** gerencia membros, canais, automações, departamentos, configurações
  (mas não cobrança nem exclusão da org).
- **AGENTE:** atende conversas e vê métricas; não mexe nas configurações da org.

### Barra lateral (navegação)
- **Caixa de entrada** (conversas) · **Funil/Pipelines** · **Atendimento** (agentes
  de IA) · **Marketing** (se o add-on estiver ativo) · **Assistente Pessoal** (se o
  add-on estiver ativo) · **Dashboard** · **Automações** · **Super Admin** (só para
  super-administradores da plataforma) · **Configurações** (rodapé).

---

## 2. Caixa de entrada (Inbox)

O coração do AxChat — onde a equipe atende os clientes.

### Lista de conversas (painel esquerdo)
- **Busca** (Ctrl/Cmd+K) por nome, telefone, protocolo ou texto das mensagens.
- **Escopos:** "Todas as conversas" vs "Minhas conversas".
- **Filtros:** status, canal, não lidas, arquivadas, grupos, tags.
- **Visões salvas:** combinações de filtros que você nomeia e reutiliza (ver §10).
- Cada conversa mostra avatar, nome, prévia da última mensagem, ícone do canal,
  selo de não lida, indicador de status (cor) e horário.

### Janela de conversa (centro)
- **Cabeçalho:** nome + canal, atribuição (escolher atendente), tags, botão de
  registros do agente de IA, botão da ficha do contato, menu (renomear, arquivar,
  configurar IA).
- **Thread:** bolhas de entrada (cliente) e saída (atendente), status de entrega
  (na fila/enviada/entregue/lida/falhou), mídias (imagem, áudio com player, vídeo,
  documento, localização, resposta a story).
- **Aviso de janela de 24h (WhatsApp):** passado o prazo desde a última mensagem
  do cliente, só dá pra mandar **template aprovado** (HSM) — ver §6.
- **Compositor:** texto (Enter envia, Shift+Enter quebra linha), **áudio**, **arquivo**,
  **respostas rápidas** (digite `/`), **templates do WhatsApp** (quando fora da janela).

### Ficha do contato (painel direito)
Nome, telefone, e-mail, tags, canais vinculados, **notas internas** (não vão pro
cliente) e atalho para todas as conversas daquele contato.

### Registros do agente de IA (painel direito)
Linha do tempo das execuções da IA naquela conversa: agente, skills chamadas,
status, tokens, e detalhe de cada chamada de ferramenta (input/output/erro).

---

## 3. Conversas — ciclo de vida e ações

### Status (máquina de estados)
- **PENDENTE:** na fila, sem atendente.
- **BOT:** a IA está conduzindo.
- **ABERTA:** atendente humano conduzindo.
- **AGUARDANDO:** atendente respondeu, esperando o cliente.
- **FECHADA:** resolvida (pode ser reaberta).

### O que o atendente faz
Atribuir/assumir ("atribuir a mim"), mudar status, mudar de departamento, arquivar/
desarquivar, marcar lida/não lida, adicionar nota interna, responder (texto/mídia/
áudio), apagar mensagem ("revogar" — apaga no app do cliente nos canais que
suportam, ex.: Zappfy), transcrever áudio recebido, e vincular a conversa a um
card do funil (§9).

### Privacidade da caixa (importante)
- **Por canal:** canais podem ser **ORG** (todos da empresa veem) ou **PRIVADOS**
  (só quem recebe acesso explícito vê). OWNER/ADMIN enxergam tudo.
- **Por atribuição:** quando uma conversa é atribuída a um **AGENTE**, os outros
  agentes deixam de vê-la na lista; quem está sem dono (na fila) todos veem;
  OWNER/ADMIN (gerência) veem tudo. Isso vale na lista, nos contadores e ao abrir
  por link as ações sensíveis (excluir, reatribuir, arquivar).

---

## 4. Contatos

- **Diretório** com busca por nome/telefone/e-mail.
- Um contato pode ter **vários canais** (a mesma pessoa no WhatsApp e no Instagram
  é **um** contato com dois canais).
- **Notas** internas datadas e atribuídas, **tags** e **campos personalizados**
  (metadata) por contato.

---

## 5. Canais (mensageria) e como conectar

Tipos suportados: **WhatsApp Oficial (Meta Cloud)**, **WhatsApp Zappfy/Uazapi**,
**Instagram**, **Telegram** e **Interno** (console no app, usado por agentes de IA
e pelo assistente pessoal).

### Conectar
Em **Configurações → Canais → Novo canal**, escolha o tipo e informe as credenciais:
- **WhatsApp Oficial:** via **Coexistência** (popup de cadastro embutido da Meta —
  o número segue funcionando no app e em paralelo na Cloud API) ou tokens manuais.
- **WhatsApp Zappfy:** instância + token do provedor (webhook configurado
  automaticamente).
- **Instagram:** token de longa duração da conta business (Graph API) + webhook.
- **Telegram:** token do bot.

### Recursos por canal
- **Visibilidade** (ORG/PRIVADO) e **membros** (aba "Agentes" do canal — quem tem
  acesso). É aqui que o dono cria uma **caixa privada** e coloca/remove pessoas.
- **Sincronização de histórico:** importa conversas/contatos/mensagens passadas do
  provedor (na criação e sob demanda; nem todo provedor suporta).
- **Saúde do WhatsApp:** qualidade, nome do negócio, status do webhook.

> **Webhooks:** para Instagram/Meta há uma URL de callback a registrar no painel da
> Meta. A URL aparece em **Configurações → Integrações**. Para a automação de
> **comentários** do Instagram, é preciso assinar o campo `comments` — ver o guia
> `docs/instagram-comentarios-webhook.md`.

---

## 6. Templates do WhatsApp (HSM)

Fora da janela de 24h, o WhatsApp só permite **mensagens-modelo aprovadas pela Meta**.
Em **Configurações → Templates WhatsApp** você **sincroniza** os templates da sua
conta Meta e vê o status (Aprovado/Pendente/Rejeitado). No chat, quando a janela
expira, o compositor oferece os templates aprovados.

---

## 7. Roteamento, SLA e Watchdog

### Departamentos
Agrupam atendentes por time/skill. Cada um tem uma **regra de distribuição**:
- **Round-robin** (reveza), **Menos ocupado** (quem tem menos conversas) ou
  **Manual**. Um departamento pode ser o **padrão** para conversas sem rota.

### SLA
Metas de **primeira resposta** e **resolução** (em minutos) por departamento.
Os timers correm em segundo plano e alertam/escalam quando estouram; param quando
a conversa é resolvida ou o atendente responde.

### Watchdog (reengajamento)
Monitor que detecta conversas "presas" (cliente falou e ninguém respondeu) e
reaciona a IA depois de um tempo configurável, respeitando quem desligou a IA de
propósito. Conta tentativas e marca como "presa pra valer" quando estoura.

---

## 8. Automações (regras gatilho → ação)

Em **Automações**: "quando X acontecer, faça Y".
- **Gatilhos:** tag adicionada/removida, mensagem recebida (com palavras-chave/
  anexo), status mudou, conversa atribuída, disparo manual.
- **Condições:** operadores (igual, contém, começa com, vazio…) com E/OU.
- **Ações:** add/remover tag, adicionar a um funil, mover de etapa, atribuir a
  atendente, enviar mensagem (texto ou template).
- **Proteções:** prioridade, limite de execuções/min, prevenção de loop (cascata
  com profundidade máxima), auto-pausa após falhas seguidas. Máx. 100 por org.

---

## 9. Chatbot (fluxos sem código)

Construtor visual de fluxos **determinísticos** (nós START/MENSAGEM/DECISÃO/AÇÃO).
Ideal para respostas fixas por palavra-chave ("digite 1 para…"). Diferente dos
**agentes de IA** (§11), que entendem linguagem natural e decidem sozinhos. Fluxos
são vinculados a canais e podem ser ligados/desligados.

---

## 10. Funil de vendas (Pipelines) e ferramentas do dia a dia

- **Pipelines (Kanban):** etapas (Lead, Qualificado, Proposta, Ganhou, Perdeu…) e
  **cards** (negócios) que você arrasta entre etapas. Cards podem ser **vinculados
  a conversas** direto do cabeçalho do chat. Várias pipelines por org.
- **Tags:** rótulos coloridos para conversas/contatos; filtráveis e usáveis como
  gatilho de automação.
- **Respostas rápidas:** mensagens prontas acionadas por `/atalho` no chat.
- **Visões da caixa:** filtros salvos e reordenáveis, pessoais de cada usuário.
- **Avaliações (CSAT):** envia um link público pro cliente dar nota + comentário;
  resultados no dashboard.
- **Notificações:** nova mensagem, atribuição, @menção, SLA — com canais in-app/
  push/som e modo "não perturbe" (ver Configurações → Notificações).
- **Produtos:** catálogo (nome, descrição, slug) que os agentes de vendas
  consultam.

---

## 11. Agentes de IA (Jarvis) — Atendimento

Agentes que atendem clientes com LLM, usando **skills** (ferramentas) e podendo
**escalar para humano**.

### Como funcionam
- **Tipos:** **ORQUESTRADOR** (recebe, entende a intenção e delega) e **WORKER**
  (especialista que executa). A hierarquia (quem reporta a quem) aparece no
  **organograma**.
- **Setores:** ATENDIMENTO e MARKETING (e PESSOAL para o assistente). Cada canal
  roteia para os agentes do setor certo.
- **Skills:** funções que o agente pode chamar — respostas, transferência,
  consultas HTTP/SQL a sistemas externos, etc. Skills sensíveis podem exigir
  **aprovação humana** (gating): em vez de executar, criam uma pendência no inbox.
- **Tools:** as conexões (HTTP/SQL) que as skills usam. Configuráveis por org.
- **Execuções:** aba "Execuções" mostra cada run com custo, tokens, duração e o
  detalhe das chamadas — ótimo para auditar falhas silenciosas.

### Memória dos agentes
Três camadas (detalhe em `docs/como-funciona-a-memoria-dos-agentes.md`):
1. **Curto prazo** — últimas ~30 mensagens (cache rápido, 7 dias).
2. **Longo prazo** — a "ficha" do contato: fatos + resumo que a IA aprende e relê
   a cada conversa.
3. **RAG** — busca por significado em conversas antigas.
Tudo isolado por contato e por organização (nada vaza entre clientes/empresas).

### Onde configurar a IA
**Configurações → IA:** liga/desliga a IA, horário de atendimento (24/7 ou
comercial + mensagem fora de hora), auto-desligar quando humano assume, **notas do
negócio** (injetadas em todos os agentes), teto mensal de tokens, **chave do LLM**
(DeepSeek por org) e o **watchdog**.

---

## 12. Marketing (add-on vendável)

Uma **crew de marketing** com 6 agentes que opera Instagram, Google Business e
anúncios no Meta. Habilitado pelo Super Admin (`marketingEnabled`) — quando ligado,
a crew é **provisionada automaticamente** para a org.

### A crew
- **Magnus** (orquestrador) — coordena a campanha e delega.
- **Alaric** — Análise & Estratégia: lê histórico (Meta Ads + Instagram) e a
  **esteira de produtos**, e recomenda **alocação de verba do mês** por produto
  (ROAS real se houver banco de vendas externo; senão por proxy CPA/CTR).
- **Wystan** — Mídia paga: monta o **anúncio de ponta a ponta** (campanha → ad set
  → criativo → ad → ativar), incluindo campanhas de **conversão** (Pixel), e faz a
  **otimização diária** (pausar/escalar/refinar).
- **Orla** — Criativo: gera a arte (imagem) e escreve a copy.
- **Caspian** — Publicação & Comunidade: publica no Instagram (feed, carrossel,
  story, reels) e Google Business, e responde **comentários** e **reviews**;
  automação **comentário → resposta + DM**.
- **Edda** — Mensuração: mede resultado e fecha o ciclo.

### Segurança e autonomia
- **Leitura/análise/rascunho são autônomos**; ações que **gastam verba, publicam ou
  ativam** passam por **aprovação humana** (pendência no inbox).
- **Verba acima do teto:** o agente pode recomendar, mas precisa justificar e
  projetar "aumentar vs não aumentar" — a decisão é sempre humana.
- **Tudo é gravado:** toda ação de marketing (sucesso, falha ou aguardando
  aprovação) fica no log de negócio + nos logs técnicos.

### Regras da org
**Configurações → Marketing:** o que a empresa faz, produtos, público, tom,
diretrizes, **verba mensal/diária**, e (opcional) uma **skill SQL** que puxa
receita por produto de um banco externo da org.

### Integrações de marketing (Configurações → Integrações)
Cada org preenche **uma vez** e os agentes operam sozinhos:
- **Instagram/Meta:** `IG_ACCESS_TOKEN`, `IG_USER_ID`, `META_ADS_ACCESS_TOKEN`,
  `META_AD_ACCOUNT_ID`, `FB_PAGE_ID`, `META_PIXEL_ID` (conversão).
- **Google Business:** `GBP_ACCESS_TOKEN`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`.
- **OpenAI (imagem):** `OPENAI_API_KEY` (gera os criativos com gpt-image-1).
Cada campo tem um "Como obter" na tela.
- **Storage de imagens (MinIO):** as artes geradas são hospedadas e a URL fica
  salva no banco (configuração de infraestrutura, no servidor).

---

## 13. Assistente Pessoal (add-on vendável)

Uma IA **privada do dono/gestor** para a vida pessoal e de trabalho. Habilitado
pelo Super Admin (`assistantEnabled`) — provisiona um agente + uma **caixa privada
só sua** automaticamente.

### O que faz (menu "Assistente Pessoal")
- **Chat** em linguagem natural ("marca dentista quinta 15h e me lembra 30 min
  antes").
- **Tarefas** (criar/listar/concluir), **Notas/brainstorm**, **Agenda** (nativa) e
  **Lembretes**.
- **Lembretes de verdade:** no horário, ele te **notifica**. Suporta "X min antes
  do compromisso", **adiar/snooze** e **recorrentes** (diário/semanal/mensal e
  **anual** para aniversários/datas).
- **Lembrete automático** ao marcar um compromisso.
- **Prep de reunião:** junta notas e tarefas relacionadas antes do compromisso.
- **Briefing diário** ("bom dia, hoje você tem…") e **resumo de fim de dia**, nos
  horários que você definir.
- **Métricas isoladas** (tarefas/lembretes/compromissos) no painel lateral.

### Privacidade
Tudo é **privado de você** — vive numa caixa privada com acesso só seu. Nada
aparece para a equipe.

### Em andamento (precisa de credencial)
- **Google Calendar** (ler/escrever): precisa de um app OAuth do Google — ver
  `docs/google-calendar-oauth-setup.md`.
- **Captura por áudio:** transcrição usa Whisper (precisa de chave OpenAI no
  servidor).

---

## 14. Crons (agendamento de agentes)

**Configurações → Crons:** agenda um agente para rodar uma tarefa numa cadência
(ex.: revisão de mídia mensal, otimização de tráfego diária). Você escolhe o
agente, descreve a tarefa e define o horário (presets simples ou expressão cron
avançada). Botão **"Rodar agora"** para disparar na hora; dá para pausar/ativar e
excluir. O agente roda numa conversa interna e a saída fica registrada.

---

## 15. Dashboard e métricas

Visão executiva (período configurável): conversas ativas, tempo médio de primeira
resposta, **cumprimento de SLA**, taxa de resolução, **CSAT**, FCR (resolução no
primeiro contato), reaberturas, volume por dia/canal/status, **horários de pico**
(mapa de calor), desempenho da IA (resolvido por bot vs escalado), tags mais usadas
e tabela de **desempenho por atendente**.

---

## 16. Configurações (resumo das abas)

- **Canais** — conectar/gerenciar canais e membros das caixas.
- **Geral** — dados da organização.
- **IA** — ligar/desligar IA, horários, notas do negócio, chave LLM, watchdog.
- **Membros** — convidar (e-mail + papel), trocar papel, acesso a canais, remover.
- **Contatos** — diretório de contatos.
- **Tags** — criar rótulos coloridos.
- **Notificações** — preferências e "não perturbe".
- **Templates WhatsApp** — sincronizar HSM com a Meta.
- **Atalhos** — respostas rápidas com `/comando`.
- **API Keys** — chaves de acesso programático.
- **Variáveis** — segredos por org (tokens/credenciais usados pelas skills).
- **Integrações** — Instagram/Meta, Google Business, OpenAI (marketing) + webhooks.
- **Marketing** — regras/verba da org (add-on).
- **Crons** — agendamento de agentes.

---

## 17. Super Admin (plataforma)

Para super-administradores da plataforma (não confundir com o OWNER de uma org):
- **Organizações:** criar empresas, definir **plano** (free/starter/pro/enterprise),
  **limites** (agentes/canais/departamentos/tokens), **cobrança**, suspender/
  reativar, gerenciar membros e **impersonar**.
- **Add-ons vendáveis:** ligar/desligar **Marketing** e **Assistente Pessoal** por
  org — ao ligar, a crew/assistente é provisionado automaticamente.
- **Usuários, Agentes, Skills, Departamentos, Planos (templates), Auditoria,
  Ferramentas do sistema e Integrações** (config da Coexistência do WhatsApp).

---

## 18. Integrações — visão geral

| Integração | Para quê | O que precisa | Onde |
|---|---|---|---|
| WhatsApp Oficial (Meta) | Atendimento | Coexistência ou tokens Meta | Canais |
| WhatsApp Zappfy | Atendimento | Instância + token | Canais |
| Instagram | Atendimento + Marketing | Token Graph + IG User ID + webhook | Canais / Integrações |
| Telegram | Atendimento | Token do bot | Canais |
| Meta Ads | Anúncios (marketing) | Token + Ad Account + Page + Pixel | Integrações |
| Google Business | Posts/reviews (marketing) | Token OAuth + Account + Location | Integrações |
| OpenAI (imagem) | Criativos de marketing | `OPENAI_API_KEY` | Integrações |
| MinIO (storage) | Hospedar imagens | Endpoint/keys/bucket (servidor) | Infra |
| DeepSeek (LLM) | Cérebro dos agentes | Chave por org | Config → IA |
| Google Calendar | Agenda do assistente | App OAuth Google | Em andamento |
| Banco de vendas (SQL) | ROAS por produto | DSN `SALES_DB_URL` | Variáveis |

Guias detalhados: `docs/instagram-comentarios-webhook.md`,
`docs/google-calendar-oauth-setup.md`, `docs/como-funciona-a-memoria-dos-agentes.md`.

---

## 19. Glossário rápido

- **Omnichannel:** vários canais (WhatsApp/Instagram/Telegram) numa caixa só.
- **Janela de 24h (WhatsApp):** após esse prazo desde a última mensagem do cliente,
  só template aprovado.
- **HSM/Template:** mensagem-modelo aprovada pela Meta.
- **SLA:** metas de tempo de resposta/resolução.
- **Orquestrador × Worker:** o que delega × o que executa.
- **Skill × Tool:** a função que o agente chama × a conexão (HTTP/SQL) que ela usa.
- **Gating (aprovação):** ação sensível que espera o OK de um humano.
- **Add-on:** módulo vendável por plano (Marketing, Assistente Pessoal).
- **Watchdog:** monitor que reaciona conversas presas.
- **Crew:** o time de agentes de marketing.
