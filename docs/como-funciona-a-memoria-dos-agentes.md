# Como funciona a memória dos agentes de IA

Explicação em linguagem simples de como **qualquer** agente do AxChat lembra das
coisas — vale pros agentes de atendimento, de marketing e (em breve) pro
assistente pessoal. No fim tem uma nota sobre o que muda pro assistente pessoal.

> TL;DR: existem **3 camadas de memória** trabalhando juntas — bloco de notas
> (curto prazo), ficha do contato (longo prazo) e busca semântica (RAG). Tudo é
> **privado por contato e por organização** — nada vaza entre clientes ou entre
> empresas.

---

## As 3 camadas

### 1. Bloco de notas — memória de curto prazo (as mensagens recentes)
**O que é:** as últimas mensagens da conversa, mantidas "à mão" pro agente não
precisar reler o histórico inteiro do banco a cada resposta.

- Fica guardada no **Redis** (memória rápida), com a chave da conversa.
- Guarda as últimas **~100 mensagens**, e o agente normalmente lê as **~30** mais
  recentes a cada vez que vai responder.
- **Expira em 7 dias** sem atividade. Conversa ativa nunca expira (o prazo se
  renova a cada mensagem nova).
- É um **cache**: se não estiver no Redis, o sistema busca no banco (Postgres) e
  recoloca no Redis.

**Analogia:** o post-it que você deixa na mesa com o assunto do momento. Some
sozinho depois de um tempo parado.

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

**Analogia:** a ficha de cadastro que você vai preenchendo sobre o cliente.
Permanente, e você relê toda vez antes de falar com ele.

### 3. Busca semântica — RAG (quando o post-it não basta)
**O que é:** uma busca por **significado** em conversas antigas, pra recuperar
contexto que já saiu da janela das 30 mensagens recentes.

- Cada mensagem relevante do cliente vira um **vetor** (embedding, via OpenAI) e
  é guardada no Postgres (extensão pgvector).
- Quando precisa, o sistema transforma a pergunta atual em vetor e busca as
  passagens **mais parecidas** (por similaridade), trazendo de volta o que for
  relevante — mesmo de semanas atrás.
- Também roda em segundo plano, depois de cada resposta.

**Analogia:** o "Ctrl+F inteligente" do histórico — acha pelo assunto, não pela
palavra exata.

---

## O ciclo completo, do começo ao fim

1. Chega uma mensagem do cliente.
2. O agente **carrega a ficha** (longo prazo) daquele contato e **as ~30 últimas
   mensagens** (curto prazo); se precisar, busca trechos antigos por **RAG**.
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

- **Curto prazo:** limitado a ~100 mensagens e 7 dias. Se autolimpa.
- **Longo prazo (ficha):** **não tem limite nem expiração hoje** — os fatos
  crescem indefinidamente. Há limpeza **manual** (operador zera a ficha de um
  contato). *Melhoria futura sugerida: um teto de fatos por ficha / poda dos de
  baixa confiança.*
- **RAG:** sem expiração; dá pra apagar entradas pontualmente.
- Não há corte por "tokens" — as mensagens enviadas ao Haiku são truncadas em
  ~500 caracteres cada pra controlar custo.

---

## O que muda pro Assistente Pessoal

O assistente pessoal usa **a mesma máquina de memória**, mas com uma diferença de
"chave": no atendimento a ficha é por (agente + **cliente**); no assistente
pessoal o "contato" é o **próprio dono**. Então a ficha de longo prazo vira a
memória que o assistente tem **sobre você** — suas preferências, rotina, projetos,
como você gosta que ele te lembre das coisas — e ela cresce ao longo do tempo,
privada só pra você. As tarefas/notas/lembretes que vamos criar são dados
**estruturados** próprios (tabelas dedicadas), separados dessa memória "aprendida"
— um complementa o outro: a ficha guarda *quem você é e como trabalha*; as tabelas
guardam *o que tem pra fazer e quando lembrar*.
