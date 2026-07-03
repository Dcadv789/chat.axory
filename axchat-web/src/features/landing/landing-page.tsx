'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  GitBranch,
  Inbox,
  Instagram,
  MessagesSquare,
  Megaphone,
  Menu,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Workflow,
  X,
  Zap,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] as const },
};

export function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#07080d] text-zinc-100 antialiased">
      {/* Glows de fundo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#0047ff]/25 blur-[140px]" />
        <div className="absolute top-[420px] -right-40 h-[400px] w-[400px] rounded-full bg-indigo-600/20 blur-[130px]" />
        <div className="absolute top-[1100px] -left-40 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-[130px]" />
      </div>
      {/* Grade sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage:
            'radial-gradient(ellipse 80% 50% at 50% 0%, #000 60%, transparent 100%)',
        }}
      />

      <div className="relative">
        <Nav />
        <Hero />
        <ChannelStrip />
        <Features />
        <AISpotlight />
        <HowItWorks />
        <Metrics />
        <Plans />
        <Faq />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}

const LOGO_URL =
  'https://img.axory.com.br/insecure/rs:fit:400:400/q:95/plain/https://storage.axory.com.br/imagens-saas-sites/1782507997191-logo_final.svg@png';

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={LOGO_URL} alt="AxChat" className="h-8 w-auto" />
  );
}

function Nav() {
  const [open, setOpen] = useState(false);
  const links = [
    { href: '#recursos', label: 'Recursos' },
    { href: '#ia', label: 'IA' },
    { href: '#planos', label: 'Planos' },
    { href: '#faq', label: 'FAQ' },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-[#07080d]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-zinc-300 transition-colors hover:text-white"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="group inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#07080d] transition-transform hover:scale-[1.03]"
          >
            Começar agora
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-zinc-300 transition-colors hover:bg-white/5 md:hidden"
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 px-5 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-md py-2 text-sm text-zinc-300 transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="rounded-md py-2 text-sm text-zinc-300 transition-colors hover:text-white">
              Entrar
            </Link>
            <Link
              href="/register"
              className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#07080d]"
            >
              Começar agora
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-12 pt-12 sm:pb-16 md:pt-24">
      <motion.div {...fadeUp} className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 backdrop-blur sm:px-3.5 sm:text-xs">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#5b8bff]" />
          <span className="text-left">Crew de agentes de IA para atendimento e marketing</span>
        </span>
        <h1 className="mt-6 text-balance text-[2rem] font-bold leading-[1.08] tracking-tight text-white sm:text-5xl sm:leading-[1.05] md:text-6xl">
          Atenda, venda e faça marketing{' '}
          <span className="bg-gradient-to-r from-[#5b8bff] via-white to-[#5b8bff] bg-clip-text text-transparent">
            com uma equipe de IA
          </span>{' '}
          num só lugar.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-zinc-400 md:text-lg">
          O AxChat unifica WhatsApp, Instagram e Telegram numa inbox só — com
          agentes de IA que respondem, qualificam, agendam e até rodam suas
          campanhas. Você aprova, eles executam.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/register"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0047ff] to-indigo-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-[#0047ff]/30 transition-transform hover:scale-[1.03] sm:w-auto"
          >
            Começar agora
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#recursos"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 sm:w-auto"
          >
            Ver como funciona
          </a>
        </div>
        <p className="mt-4 text-xs text-zinc-500">
          Sem cartão de crédito para começar · Configure em minutos
        </p>
      </motion.div>

      <HeroVisual />
    </section>
  );
}

function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.15 }}
      className="mx-auto mt-10 max-w-5xl sm:mt-16"
    >
      <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-1.5 shadow-2xl shadow-black/60 backdrop-blur sm:p-2">
        <div className="grid gap-2 rounded-xl bg-[#0a0b12] p-2 sm:p-3 md:grid-cols-[1.4fr_1fr]">
          {/* Coluna conversa */}
          <div className="rounded-lg border border-white/5 bg-[#0d0e17] p-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-xs font-bold text-white">
                JM
              </div>
              <div>
                <p className="text-sm font-medium text-white">João Marques</p>
                <p className="flex items-center gap-1 text-[11px] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> WhatsApp · online
                </p>
              </div>
              <span className="ml-auto rounded-md bg-[#0047ff]/15 px-2 py-1 text-[10px] font-medium text-[#7ea2ff]">
                IA atendendo
              </span>
            </div>
            <div className="space-y-2.5 pt-4 text-sm">
              <Bubble side="left">Oi! Vcs fazem consultoria financeira pra PME?</Bubble>
              <Bubble side="right" ai>
                Fazemos sim, João! 🙌 Cuidamos de fluxo de caixa, organização e
                relatórios. Quer que eu já agende um diagnóstico gratuito?
              </Bubble>
              <Bubble side="left">Quero! Pode ser quinta de manhã?</Bubble>
              <Bubble side="right" ai>
                Perfeito — reservei quinta às 9h. Te mando o link no dia. ✅
              </Bubble>
            </div>
          </div>
          {/* Coluna IA / ações */}
          <div className="flex flex-col gap-2">
            <div className="rounded-lg border border-white/5 bg-[#0d0e17] p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[#0047ff] to-indigo-500">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-semibold text-white">Crew de IA</p>
              </div>
              <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Qualificou o lead
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Agendou o diagnóstico
                </li>
                <li className="flex items-center gap-2">
                  <Timer className="h-3.5 w-3.5 text-[#7ea2ff]" /> Cria follow-up p/ quinta
                </li>
              </ul>
            </div>
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <ShieldCheck className="h-4 w-4" /> Aguardando sua aprovação
              </p>
              <p className="mt-1.5 text-xs text-zinc-400">
                Subir orçamento da campanha “Diagnóstico Grátis” para{' '}
                <span className="font-medium text-white">R$ 30/dia</span>
              </p>
              <div className="mt-3 flex gap-2">
                <span className="rounded-md bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white">
                  Aprovar
                </span>
                <span className="rounded-md border border-white/10 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                  Rejeitar
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Bubble({
  children,
  side,
  ai,
}: {
  children: React.ReactNode;
  side: 'left' | 'right';
  ai?: boolean;
}) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 leading-snug ${
          side === 'right'
            ? ai
              ? 'rounded-br-sm bg-gradient-to-br from-[#0047ff] to-indigo-500 text-white'
              : 'rounded-br-sm bg-white text-[#07080d]'
            : 'rounded-bl-sm bg-white/5 text-zinc-200'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function ChannelStrip() {
  const channels = [
    { icon: MessagesSquare, label: 'WhatsApp' },
    { icon: Instagram, label: 'Instagram' },
    { icon: Send, label: 'Telegram' },
    { icon: Megaphone, label: 'Meta Ads' },
    { icon: Inbox, label: 'Google Business' },
  ];
  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-center text-xs font-medium uppercase tracking-widest text-zinc-500">
        Todos os seus canais, uma conversa só
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
        {channels.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-zinc-400">
            <c.icon className="h-5 w-5" />
            <span className="text-sm font-medium">{c.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Inbox,
    title: 'Inbox omnichannel',
    desc: 'WhatsApp (Oficial e Coexistência), Instagram (DMs e comentários) e Telegram numa caixa de entrada única, com histórico, tags e atribuição por setor.',
  },
  {
    icon: Bot,
    title: 'Crew de agentes de IA',
    desc: 'Não é um chatbot: é uma equipe. Um orquestrador delega para especialistas que respondem o cliente, qualificam, agendam e devolvem a bola — sozinhos.',
  },
  {
    icon: Megaphone,
    title: 'Marketing no automático',
    desc: 'A IA lê a performance do seu Meta Ads, sugere onde colocar verba, gera criativos e publica no Instagram e Google — dentro do teto de orçamento que você definir.',
  },
  {
    icon: ShieldCheck,
    title: 'Você aprova, a IA executa',
    desc: 'Nada sensível vai ao ar sem o seu OK. Ações de gasto ou publicação viram cards de aprovação na própria conversa — aprovar ou rejeitar em um clique.',
  },
  {
    icon: GitBranch,
    title: 'Pipelines & CRM',
    desc: 'Funis visuais, contatos, tags e etapas. Acompanhe cada lead do primeiro “oi” até o fechamento, com a IA movendo o card conforme a conversa evolui.',
  },
  {
    icon: Workflow,
    title: 'Automações & agendamentos',
    desc: 'Dispare agentes numa cadência (diária, semanal), monte fluxos automáticos e um chatbot — deixe a operação rodando enquanto você dorme.',
  },
];

function Features() {
  return (
    <section id="recursos" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <SectionTag>Recursos</SectionTag>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          Tudo para atender e crescer, sem trocar de aba
        </h2>
        <p className="mt-4 text-zinc-400">
          Uma plataforma que junta atendimento, vendas e marketing — com IA de
          verdade no meio de tudo.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: (i % 3) * 0.08 }}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
          >
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-[#0047ff]/10 blur-2xl transition-opacity group-hover:opacity-100" />
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-white/10 to-transparent">
                <f.icon className="h-5 w-5 text-[#7ea2ff]" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function AISpotlight() {
  const flow = [
    { name: 'Orquestrador', role: 'entende o pedido e delega' },
    { name: 'Analista', role: 'lê os dados e decide a estratégia' },
    { name: 'Criativo', role: 'gera a arte e a copy' },
    { name: 'Mídia', role: 'monta a campanha e o orçamento' },
    { name: 'Mensuração', role: 'mede o resultado e aprende' },
  ];
  return (
    <section id="ia" className="relative mx-auto max-w-6xl px-5 py-16 md:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <motion.div {...fadeUp}>
          <SectionTag>Inteligência Artificial</SectionTag>
          <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Não é um chatbot.{' '}
            <span className="bg-gradient-to-r from-[#5b8bff] to-indigo-400 bg-clip-text text-transparent">
              É uma equipe que trabalha por você.
            </span>
          </h2>
          <p className="mt-5 text-zinc-400">
            Enquanto os outros te dão uma caixinha de respostas prontas, o AxChat
            te dá uma <span className="text-white">crew</span>: um agente
            orquestrador que recebe a demanda e distribui para especialistas —
            cada um faz a sua parte e devolve, num ciclo que fecha sozinho.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'Delegação automática entre agentes especialistas',
              'Memória de contexto: cada conversa continua de onde parou',
              'Roda em cadência (crons) ou reage em tempo real',
              'Sempre sob o seu controle, com aprovações no fluxo',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0047ff]/20">
                  <Check className="h-3 w-3 text-[#7ea2ff]" />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent p-6">
            <div className="space-y-2.5">
              {flow.map((a, i) => (
                <div key={a.name}>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#0d0e17] p-3.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#0047ff] to-indigo-500 text-xs font-bold text-white">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{a.name}</p>
                      <p className="text-xs text-zinc-400">{a.role}</p>
                    </div>
                    <Bot className="ml-auto h-4 w-4 text-zinc-600" />
                  </div>
                  {i < flow.length - 1 && (
                    <div className="ml-[34px] h-3 w-px bg-gradient-to-b from-[#0047ff]/60 to-transparent" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: MessagesSquare,
      title: 'Conecte seus canais',
      desc: 'WhatsApp, Instagram e Telegram em minutos — login pela Meta, sem digitar token na mão.',
    },
    {
      icon: Bot,
      title: 'Configure sua crew',
      desc: 'Diga o que sua empresa faz, seu público e seu tom. A IA assume a partir daí.',
    },
    {
      icon: Zap,
      title: 'A IA atende e você aprova',
      desc: 'Respostas, agendamentos e campanhas no automático — com você no controle das decisões.',
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <SectionTag>Como funciona</SectionTag>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          No ar em minutos
        </h2>
      </motion.div>
      <div className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-3">
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: i * 0.1 }}
            className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6"
          >
            <span className="text-5xl font-bold text-white/5">0{i + 1}</span>
            <div className="-mt-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#0047ff] to-indigo-500">
                <s.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function Metrics() {
  const items = [
    { value: '3+', label: 'Canais numa inbox só' },
    { value: '24/7', label: 'IA atendendo sem parar' },
    { value: '1 clique', label: 'Para aprovar cada ação' },
    { value: '∞', label: 'Fluxos e agentes' },
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-10">
      <motion.div
        {...fadeUp}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-4"
      >
        {items.map((m) => (
          <div key={m.label} className="bg-[#0a0b12] p-6 text-center sm:p-8">
            <p className="bg-gradient-to-r from-white to-[#7ea2ff] bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
              {m.value}
            </p>
            <p className="mt-2 text-sm text-zinc-400">{m.label}</p>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

const PLANS = [
  {
    name: 'Inbox',
    tagline: 'Comece a centralizar',
    features: ['Inbox omnichannel', 'WhatsApp + Instagram + Telegram', 'Contatos e tags', 'Atribuição por setor'],
    highlight: false,
  },
  {
    name: 'Essencial',
    tagline: 'Adicione a IA',
    features: ['Tudo do Inbox', 'Agente de IA no atendimento', 'Respostas e qualificação', 'Automações básicas'],
    highlight: false,
  },
  {
    name: 'Profissional',
    tagline: 'A crew completa',
    features: ['Tudo do Essencial', 'Crew de agentes de IA', 'Pipelines & CRM', 'Agendamentos e crons'],
    highlight: true,
  },
  {
    name: 'Performance',
    tagline: 'Marketing no automático',
    features: ['Tudo do Profissional', 'Crew de marketing', 'Gestão de Meta Ads por IA', 'Criativos + publicação'],
    highlight: false,
  },
];

function Plans() {
  return (
    <section id="planos" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
        <SectionTag>Planos</SectionTag>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          Escolha por onde começar
        </h2>
        <p className="mt-4 text-zinc-400">
          Do inbox à crew de marketing — evolua conforme sua operação cresce.
          Cobrança por usuário + IA, com desconto conforme o volume.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p, i) => (
          <motion.div
            key={p.name}
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: (i % 4) * 0.06 }}
            className={`relative flex flex-col rounded-2xl border p-6 ${
              p.highlight
                ? 'border-[#0047ff]/50 bg-gradient-to-b from-[#0047ff]/[0.12] to-transparent'
                : 'border-white/10 bg-white/[0.03]'
            }`}
          >
            {p.highlight && (
              <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#0047ff] to-indigo-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Mais popular
              </span>
            )}
            <p className="text-sm font-semibold text-white">{p.name}</p>
            <p className="mt-1 text-xs text-zinc-400">{p.tagline}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#7ea2ff]" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`mt-6 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] ${
                p.highlight
                  ? 'bg-gradient-to-r from-[#0047ff] to-indigo-500 text-white'
                  : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
              }`}
            >
              Começar
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: 'Preciso saber programar para usar a IA?',
    a: 'Não. Você descreve sua empresa, seu público e seu tom de voz em linguagem natural, e a crew de IA assume a partir daí. Toda a configuração é feita por telas simples.',
  },
  {
    q: 'A IA age sozinha sem meu controle?',
    a: 'Nunca em ações sensíveis. Responder cliente é automático, mas qualquer coisa que gaste dinheiro ou publique algo público vira um card de aprovação — você aprova ou rejeita em um clique.',
  },
  {
    q: 'Funciona com o WhatsApp que eu já uso?',
    a: 'Sim. Você conecta pelo login oficial da Meta (Embedded Signup) ou por coexistência via QR Code — o número continua funcionando no seu celular e passa a responder pela plataforma.',
  },
  {
    q: 'Consigo começar pequeno e crescer depois?',
    a: 'Com certeza. Comece só com o inbox e vá adicionando IA, pipelines e marketing conforme a operação cresce. Você muda de plano quando quiser.',
  },
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      <motion.div {...fadeUp} className="text-center">
        <SectionTag>Dúvidas</SectionTag>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
          Perguntas frequentes
        </h2>
      </motion.div>
      <div className="mt-10 space-y-3">
        {FAQS.map((f, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-sm font-medium text-white">{f.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open === i ? 'rotate-180' : ''}`}
              />
            </button>
            {open === i && (
              <p className="px-5 pb-5 text-sm leading-relaxed text-zinc-400">{f.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <motion.div
        {...fadeUp}
        className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0047ff]/20 via-[#0a0b12] to-[#0a0b12] px-6 py-12 text-center sm:py-16 md:px-16"
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-[#0047ff]/30 blur-[120px]" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Pronto para colocar sua operação no automático?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-300">
            Conecte seus canais, ligue a crew de IA e veja o atendimento e o
            marketing andarem sozinhos — com você no comando.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-[#07080d] transition-transform hover:scale-[1.03] sm:w-auto"
            >
              Começar agora
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
            >
              Já tenho conta
            </Link>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
        <Logo />
        <p className="text-xs text-zinc-500">
          © {new Date().getFullYear()} AxChat · Axory. Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-5 text-xs text-zinc-400">
          <Link href="/login" className="transition-colors hover:text-white">
            Entrar
          </Link>
          <Link href="/register" className="transition-colors hover:text-white">
            Criar conta
          </Link>
        </div>
      </div>
    </footer>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#7ea2ff]">
      {children}
    </span>
  );
}
