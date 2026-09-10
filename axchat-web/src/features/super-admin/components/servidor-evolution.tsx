'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PlugZap, XCircle } from 'lucide-react';
import { superAdminService } from '@/features/super-admin/services/super-admin.service';

/**
 * Endereço do servidor Evolution que atende o WhatsApp não oficial de todos os
 * clientes.
 *
 * Fica aqui, e não numa variável de ambiente, porque trocar de servidor é
 * decisão de dono de plataforma e precisa valer na hora — sem deploy.
 */
export function ServidorEvolution() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery({
    queryKey: ['super-admin-evolution'],
    queryFn: superAdminService.getEvolution,
  });

  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [teste, setTeste] = useState<{ ok: boolean; detalhe: string } | null>(null);

  useEffect(() => {
    if (config) setBaseUrl(config.baseUrl ?? '');
  }, [config]);

  const salvar = useMutation({
    mutationFn: () =>
      superAdminService.updateEvolution({
        baseUrl,
        // Campo em branco NÃO apaga a chave salva: só significa "não mexi
        // nela". Quem quer limpar de verdade usa o botão dedicado — senão
        // qualquer salvamento de endereço derrubaria o WhatsApp de todo mundo.
        ...(apiKey.trim() ? { apiKey } : {}),
      }),
    onSuccess: () => {
      setApiKey('');
      setTeste(null);
      qc.invalidateQueries({ queryKey: ['super-admin-evolution'] });
    },
  });

  const testar = useMutation({
    mutationFn: superAdminService.testEvolution,
    onSuccess: setTeste,
    onError: (e: any) =>
      setTeste({ ok: false, detalhe: e?.message ?? 'Falha ao testar.' }),
  });

  const limparChave = useMutation({
    mutationFn: () => superAdminService.updateEvolution({ apiKey: '' }),
    onSuccess: () => {
      setTeste(null);
      qc.invalidateQueries({ queryKey: ['super-admin-evolution'] });
    },
  });

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex items-start gap-3">
        <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            WhatsApp não oficial — servidor Evolution
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            É este servidor que hospeda as conexões de QR code dos clientes.
            Enquanto estiver vazio, o canal &quot;WhatsApp não oficial&quot; não
            é oferecido na criação de canais.
          </p>
        </div>
        {config?.configured && (
          <span className="ml-auto shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            Configurado
          </span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-zinc-500">Carregando…</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Endereço do servidor
            </label>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://evolution.suaempresa.com"
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              A raiz da API, com http:// ou https://. Sem caminho no fim.
              {config?.source.baseUrl === 'env' && ' Hoje vindo do ambiente.'}
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Chave global (AUTHENTICATION_API_KEY)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                config?.apiKeySet
                  ? `${config.apiKeyPreview} — deixe em branco para manter`
                  : 'Cole a chave do servidor'
              }
              className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 font-mono text-sm text-zinc-900 dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
            <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              A chave nunca é exibida depois de salva.
              {config?.apiKeySet && (
                <button
                  onClick={() => limparChave.mutate()}
                  className="ml-1 underline hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  Apagar a chave salva
                </button>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              onClick={() => testar.mutate()}
              disabled={testar.isPending || !config?.configured}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              {testar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Testar conexão
            </button>
          </div>

          {salvar.isError && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {(salvar.error as any)?.response?.data?.message ??
                'Não consegui salvar.'}
            </p>
          )}

          {/* O teste é o que separa "preenchi" de "funciona". Sem ele, o
              primeiro a descobrir que a chave está errada seria um cliente
              olhando um QR que nunca aparece. */}
          {teste && (
            <div
              className={`flex items-start gap-2 rounded-md border p-2.5 text-xs ${
                teste.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300'
              }`}
            >
              {teste.ok ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span>{teste.detalhe}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
