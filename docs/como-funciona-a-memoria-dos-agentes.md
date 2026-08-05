# Como funciona a memória dos agentes de IA

Explicação em linguagem simples de como **qualquer** agente do AxChat lembra das
coisas — vale pros agentes de atendimento, de marketing e pro assistente
pessoal. No fim tem uma nota sobre o que muda pro assistente pessoal.

> TL;DR: existem **3 camadas de memória** trabalhando juntas — as mensagens
> recentes da conversa (curto prazo), a ficha do contato (longo prazo) e a busca
> semântica (RAG). Tudo é **privado por contato e por organização** — nada vaza
> entre clientes ou entre empresas.

---

## As 3 camadas

### 1. Mensagens recentes — memória de curto prazo
**O que é:** as últimas mensagens da conversa, lidas direto do banco a cada vez
que o agente vai responder.

- Vem do **Postgres**, numa consulta única por resposta. **Não há cache.**
- Quantas mensagens: configurável por empresa em **Configurações › IA**, no campo
  *"Histórico que o agente lê"*. **Padrão: 50** (faixa aceita: 5 a 200).
- Não há corte por tokens nem sumarização: se a janela é 50, entram as 50 mais
  recentes, ponto.

**Por que sem cache?** Já foi medido: a consulta executa em **0,34 ms** no
Postgres (índice por conversa + data), contra **2 a 15 segundos** da chamada ao
modelo de IA. A leitura do histórico é ~0,05% do tempo de uma resposta. Um cache
economizaria meio milissegundo e traria em troca o problema de invalidação — toda
mensagem nova, edição ou exclusão teria que limpar o cache, e errar um desses
caminhos faz o agente responder com histórico defasado. Não compensa.

**O que NÃO entra nessa janela:**
- **Notas internas** — são gravadas como mensagens de saída, então sem filtro
  virariam falas do próprio agente, e ele poderia repetir pro cliente algo escrito
  só pra equipe.
- **Mensagens apagadas** ("excluir para todos") — o que o operador apagou o agente
  não lê.

**Analogia:** reler as últimas páginas da conversa antes de responder.

### 2. Ficha do contato — memória de longo prazo (fatos + resumo)
**O que é:** o que o agente **aprendeu** sobre aquela pessoa, de forma permanente.

- Guardada no **Postgres**, na tabela `AiAgentMemory`, com **uma ficha por par
  (agente + contato)**. Ou seja: o agente Daniel tem uma ficha sobre o cliente
  João; o agente André tem a própria ficha sobre o mesmo João. São separadas.
- Cada ficha tem:
  - **`summary`** — um parágrafo curto resumindo quem é a pessoa / o relacionamento.
  - **`facts`** — uma lista de fatos curtos, cada um com **categoria**
    (identidade, preferência, histórico, contexto), **confiança** (0 a 1) e
    **data**. Ex.: *"prefere ser chamado de Dr. João"*, *"comprou o produto X em
    março"*, *"não gosta de ligação, só WhatsApp"*.
  - **`totalInteractions`** e **`lastInteractionAt`** — contadores de uso.

**Como os fatos entram lá (extração automática):**
1. Quando um agente **termina de responder** (mandou mensagem, delegou ou passou
   pra humano), o sistema dispara um trabalho em segundo plano (fila BullMQ) —
   sem travar a resposta pro cliente.
2. Esse trabalho pega as **últimas ~20 mensagens** + a ficha atual e manda pra um
   modelo **barato e rápido (Claude Haiku)** com a instrução: *"o que há de novo
   pra anotar? o que ficou desatualizado pra remover? atualize o resumo."*
3. O Haiku devolve: **fatos novos**, **fatos a remover** (quando algo mudou/foi
   contradito) e um **resumo atualizado**. O sistema grava isso na ficha.

**Como a ficha volta pro agente:** toda vez que o agente vai responder, o sistema
**carrega a ficha** daquele (agente + contato) e **injeta o resumo + os fatos no
começo do prompt** — então o agente "já chega sabendo" quem é a pessoa.

É esta camada que sobrevive quando a conversa passa da janela de mensagens
recentes: o detalhe some, mas o aprendizado fica.

**Analogia:** a ficha de cadastro que você vai preenchendo sobre o cliente.
Permanente, e você relê toda vez antes de falar com ele.

### 3. Busca semântica — RAG (quando as mensagens recentes não bastam)
**O que é:** uma busca por **significado** no histórico, pra recuperar contexto
que já saiu da janela de mensagens recentes.

- Cada mensagem indexada vira um **vetor** (embedding, via OpenAI) guardado na
  tabela `ai_vector_entries`.
- Quando o agente vai responder, a mensagem atual vira vetor e o sistema busca as
  passagens **mais parecidas**, trazendo de volta o que for relevante — inclusive
  de **conversas anteriores do mesmo contato**, não só da conversa atual.
- A indexação roda em segundo plano (fila `rag-indexer`), depois de cada resposta.

**Detalhe de implementação:** a similaridade de cosseno é calculada **na
aplicação**, não no banco. A extensão `pgvector` não está disponível no Postgres
em uso, e trocar a imagem afetaria o banco compartilhado com o Axdeal. Como a
busca sempre filtra por agente e contato antes de calcular, o conjunto avaliado é
de dezenas de vetores — irrelevante em custo. Se algum escopo passar de ~10 mil
vetores, vale migrar pra pgvector; só o `VectorStoreService` muda.

**Pré-requisito operacional:** o RAG depende da **chave OpenAI** configurada em
**Super Admin › Motor de IA** (bloco *Áudio/OpenAI*). Sem ela a indexação não
gera embedding e o índice fica vazio — a busca não encontra nada, e o agente
segue funcionando com as outras duas camadas.

**Analogia:** o "Ctrl+F inteligente" do histórico — acha pelo assunto, não pela
palavra exata.

---

## O ciclo completo, do começo ao fim

1. Chega uma mensagem do cliente.
2. O agente carrega a **ficha** (longo prazo) daquele contato e as **N últimas
   mensagens** da conversa (padrão 50); em paralelo, busca trechos antigos por
   **RAG**.
3. Tudo isso entra no prompt → o agente responde já com contexto.
4. Depois de responder, em segundo plano: o **Haiku atualiza a ficha** (novos
   fatos/resumo) e o **RAG indexa** a mensagem nova.
5. Na próxima conversa, o agente já chega sabendo do que aprendeu.

---

## Privacidade e isolamento (importante)

- A memória é **sempre por (agente + contato)**, e tanto o agente quanto o
  contato pertencem a **uma organização**. Contatos **não são compartilhados**
  entre organizações.
- Resultado: **é impossível** a memória de um cliente vazar pra outro cliente, ou
  de uma empresa pra outra. O isolamento é estrutural (pela forma como os dados
  se ligam no banco), não depende de "lembrar de filtrar".

## Limites e limpeza (estado atual — pontos de atenção)

- **Curto prazo:** a janela é o limite. Fora dela, o detalhe só volta pela ficha
  ou pelo RAG. Em canais que **não rotacionam conversa** (Telegram, Instagram — só
  o WhatsApp Official fecha por janela de 24h), a conversa acumula
  indefinidamente, então a janela é atingida com facilidade.
- **Longo prazo (ficha):** **não tem limite nem expiração hoje** — os fatos
  crescem indefinidamente e vão inteiros no prompt a cada resposta. Há limpeza
  **manual** (operador zera a ficha de um contato). *Melhoria pendente: teto de
  fatos por ficha e poda dos de baixa confiança.*
- **RAG:** sem expiração; dá pra apagar entradas pontualmente. O índice se
  constrói **daqui pra frente** — mensagens anteriores à ativação só entram
  rodando o backfill (`npm run rag:backfill`).
- Não há corte por "tokens" em nenhuma camada. As mensagens enviadas ao Haiku são
  truncadas em ~500 caracteres cada pra controlar custo.

---

## O que muda pro Assistente Pessoal

O assistente pessoal usa **a mesma máquina de memória**, mas com uma diferença de
"chave": no atendimento a ficha é por (agente + **cliente**); no assistente
pessoal o "contato" é o **próprio dono**. Então a ficha de longo prazo vira a
memória que o assistente tem **sobre você** — suas preferências, rotina, projetos,
como você gosta que ele te lembre das coisas — e ela cresce ao longo do tempo,
privada só pra você. As tarefas/notas/lembretes são dados **estruturados**
próprios (tabelas dedicadas), separados dessa memória "aprendida" — um complementa
o outro: a ficha guarda *quem você é e como trabalha*; as tabelas guardam *o que
tem pra fazer e quando lembrar*.
