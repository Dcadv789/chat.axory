'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Cpu, Eye, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { aiModelProvidersService } from '../services/ai-model-providers.service';
import { aiSettingsService } from '@/features/ai-agents/services/ai-settings.service';

/**
 * Qual provedor da organização atende cada motor.
 *
 * Antes a escolha saía do `modelId` salvo em cada agente casando com o nome de
 * um provedor registrado — e quando não casava, a chamada ia pra chave da
 * AxChat sem avisar: a empresa dizia "pago minha IA" e a plataforma pagava.
 * Agora a escolha é explícita, e sem ela a IA não roda.
 *
 * Só aparece pra quem usa motor próprio. Quem está na IA da AxChat não escolhe
 * nada aqui — o motor é o do Super Admin.
 */
export function MotoresDaOrganizacao({
  usaIaDaAxchat,
}: {
  usaIaDaAxchat: boolean;
}) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState('');
  const [visao, setVisao] = useState('');

  const { data: provedores = [], isLoading } = useQuery({
    queryKey: ['ai-model-providers'],
    queryFn: aiModelProvidersService.list,
    enabled: !usaIaDaAxchat,
  });

  const { data: org } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiSettingsService.get,
  });

  useEffect(() => {
    setTexto(org?.aiTextProviderId ?? '');
    setVisao(org?.aiVisionProviderId ?? '');
  }, [org?.aiTextProviderId, org?.aiVisionProviderId]);

  const salvar = useMutation({
    mutationFn: () =>
      aiSettingsService.update({
        aiTextProviderId: texto || null,
        aiVisionProviderId: visao || null,
      }),
    onSuccess: () => {
      toast.success('Motores atualizados');
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Erro ao salvar'),
  });

  if (usaIaDaAxchat) return null;

  const utilizaveis = provedores.filter((p) => p.isActive && p.apiKeySet);
  const semTexto = !texto;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-black">
      <div className="border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div className="flex items-start gap-3">
          <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-[#8ab4ff]" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Qual modelo atende o quê
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Sua empresa usa IA própria, então escolha aqui qual dos seus
              modelos responde as conversas e qual lê imagens. Todos os agentes
              passam a usar o que você escolher.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : utilizaveis.length === 0 ? (
          <Aviso>
            Nenhum modelo utilizável cadastrado. Adicione um abaixo, com chave
            de API, e volte aqui para escolher. Enquanto isso a IA não vai
            responder — antes ela caía na conta da AxChat, o que escondia o
            problema.
          </Aviso>
        ) : (
          <>
            {semTexto && (
              <Aviso>
                Sem modelo de conversa escolhido, a IA não responde. Escolha um
                e salve.
              </Aviso>
            )}

            <Campo
              icone={Cpu}
              rotulo="Conversas (texto)"
              ajuda="É o modelo que responde o cliente. Vale para todos os agentes."
            >
              <select
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className={SELECT}
              >
                <option value="">— Escolha um modelo —</option>
                {utilizaveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.modelId}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo
              icone={Eye}
              rotulo="Leitura de imagem (opcional)"
              ajuda="Nem todo modelo lê imagem — DeepSeek, por exemplo, não lê. Sem escolher aqui, a imagem que chegar vira um aviso em texto para o agente, em vez de ser lida."
            >
              <select
                value={visao}
                onChange={(e) => setVisao(e.target.value)}
                className={SELECT}
              >
                <option value="">— Não ler imagens —</option>
                {utilizaveis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.modelId}
                  </option>
                ))}
              </select>
            </Campo>

            <div className="flex justify-end">
              <button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {salvar.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </>
        )}

        <p className="border-t border-zinc-100 pt-3 text-[11px] leading-relaxed text-zinc-500 dark:border-white/5">
          A <strong>busca no histórico</strong> das conversas não entra aqui —
          ela é infraestrutura da AxChat e roda por nossa conta, sem custo de
          API para você.
        </p>
      </div>
    </div>
  );
}

const SELECT =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:focus:border-[#8ab4ff]';

function Campo({
  icone: Icone,
  rotulo,
  ajuda,
  children,
}: {
  icone: React.ElementType;
  rotulo: string;
  ajuda: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
        <Icone className="h-3.5 w-3.5 text-zinc-400" />
        {rotulo}
      </span>
      {children}
      <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
        {ajuda}
      </span>
    </label>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
