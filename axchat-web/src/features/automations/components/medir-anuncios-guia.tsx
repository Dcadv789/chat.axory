'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Megaphone,
  Target,
} from 'lucide-react';

/**
 * Guia de "como medir se o anúncio deu resultado", na tela onde a pessoa vai
 * montar a automação que faz isso funcionar.
 *
 * A medição depende de três coisas que ninguém adivinha sozinho: um pipeline
 * de verdade, uma automação com a condição certa, e alguém marcando o negócio
 * como ganho com valor. Faltando qualquer uma, o relatório vem vazio — e vazio
 * parece defeito do sistema, não configuração incompleta.
 *
 * Fica recolhido por padrão: quem já configurou não precisa reler.
 */
export function MedirAnunciosGuia() {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
      >
        <Megaphone className="h-5 w-5 shrink-0 text-primary dark:text-[#8ab4ff]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            Quer saber quanto cada anúncio está trazendo de cliente?
          </p>
          <p className="text-xs text-zinc-500">
            Três configurações e o AxChat passa a mostrar custo por cliente e
            retorno de cada campanha.
          </p>
        </div>
        {aberto ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
        )}
      </button>

      {aberto && (
        <div className="border-t border-zinc-200 px-5 py-4 dark:border-white/10">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            O Meta te diz quanto você gastou e quantos cliques teve. Ele não
            sabe se aquele clique virou cliente — isso acontece aqui dentro, na
            conversa e no funil. Quando as três coisas abaixo estiverem no
            lugar, o AxChat junta as duas pontas e responde{' '}
            <strong>quanto custou cada cliente de verdade</strong>.
          </p>

          <div className="mt-4 space-y-3">
            <Passo
              numero={1}
              titulo="Um funil com etapas que façam sentido pro seu negócio"
            >
              Não precisa ser complicado — algo como <em>Novo lead → Em
              conversa → Proposta enviada → Fechado</em> já resolve. O que
              importa é ter para onde mandar quem chega, e conseguir marcar no
              fim se virou cliente ou não.
              <Atalho href="/pipelines">Ir para Funis</Atalho>
            </Passo>

            <Passo
              numero={2}
              titulo="Uma automação que cria o card quando o lead chega"
            >
              Crie uma automação com o gatilho{' '}
              <Marca>Mensagem recebida</Marca>, adicione a condição{' '}
              <Marca>Veio de anúncio = sim</Marca> e a ação{' '}
              <Marca>Adicionar ao funil</Marca>, apontando para a primeira
              etapa.
              <p className="mt-1.5 text-xs text-zinc-500">
                A condição é o detalhe que evita dor de cabeça: sem ela, toda
                mensagem vira card — inclusive de cliente antigo mandando “bom
                dia”.
              </p>
            </Passo>

            <Passo numero={3} titulo="Fechar o card com o valor do negócio">
              Quando o cliente fecha, marque o card como <strong>Ganho</strong>{' '}
              e preencha o valor. É daí que sai o faturamento por campanha.
              <p className="mt-1.5 text-xs text-zinc-500">
                Card marcado como ganho sem valor conta como cliente, mas com
                receita zero — e o retorno da campanha aparece zerado.
              </p>
            </Passo>
          </div>

          <div className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 dark:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Target className="h-3.5 w-3.5" />
              E quando o anúncio manda pro site?
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              Aí a pessoa não cai numa conversa, e o AxChat não tem como saber
              que ela existiu. Para não perder essa medição, use no site um
              botão de WhatsApp com <strong>mensagem já preenchida</strong>{' '}
              contendo um código da campanha — algo como{' '}
              <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-[11px] dark:bg-white/10">
                wa.me/5511999999999?text=Vim%20pelo%20site%20[promo-maio]
              </code>
              . A primeira mensagem chega com o código, e você usa a condição{' '}
              <Marca>Texto contém</Marca> no lugar de “veio de anúncio” para
              criar o card na etapa certa.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">
              Vale saber: assim você mede quem <em>chegou a falar com você</em>.
              Quem comprou direto no site sem conversar não passa por aqui —
              esse número mora no Meta Pixel, no seu site.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Passo({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary dark:bg-primary/20 dark:text-[#8ab4ff]">
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {titulo}
        </p>
        <div className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {children}
        </div>
      </div>
    </div>
  );
}

function Marca({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
      {children}
    </span>
  );
}

function Atalho({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline dark:text-[#8ab4ff]"
    >
      {children} <ExternalLink className="h-3 w-3" />
    </Link>
  );
}
