'use client';

import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, AtSign } from 'lucide-react';
import { toast } from 'sonner';
import {
  channelsService,
  type CoexistenceConfig,
  type ChannelVisibility,
} from '../services/channels.service';

interface ThreadsConnectProps {
  name: string;
  visibility?: ChannelVisibility;
}

/**
 * Conexão do Threads via OAuth próprio (threads.net). Clicar redireciona o
 * navegador pra janela de autorização da Meta; ao voltar, o callback do backend
 * cria o canal e devolve pra cá com ?threads=connected. O app do Threads (id +
 * secret) é configurado pelo Super Admin.
 */
export function ThreadsConnect({ name, visibility }: ThreadsConnectProps) {
  const [config, setConfig] = useState<CoexistenceConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let active = true;
    channelsService
      .getCoexistenceConfig()
      .then((cfg) => active && setConfig(cfg))
      .catch(() => active && setConfig({ appId: '', configId: '', enabled: false }))
      .finally(() => active && setLoadingConfig(false));
    return () => {
      active = false;
    };
  }, []);

  const enabled = !!config?.threadsEnabled;

  const connect = async () => {
    if (!name.trim()) return;
    setRedirecting(true);
    try {
      const { url } = await channelsService.getThreadsAuthUrl(name.trim(), visibility);
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar conexão com o Threads');
      setRedirecting(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="mt-6 flex items-center justify-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando configuração...
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="mt-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Conexão com o Threads indisponível: o app do Threads ainda não foi
          configurado. Peça ao <strong>Super Admin</strong> para preencher{' '}
          <strong>Threads App ID</strong> e <strong>App Secret</strong> em{' '}
          <strong>Integrações</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs leading-relaxed text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">
        <p className="font-medium">Conectar o Threads</p>
        <ol className="mt-2 space-y-1.5">
          <li>1. Clique em <strong>Conectar com o Threads</strong> abaixo.</li>
          <li>2. Você é levado pra Meta pra autorizar o acesso à sua conta do Threads.</li>
          <li>3. Ao confirmar, voltamos e o canal é criado automaticamente.</li>
        </ol>
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          Permite publicar (texto, imagem, vídeo, carrossel), gerenciar respostas
          e ver métricas dos posts.
        </p>
      </div>

      <button
        type="button"
        onClick={connect}
        disabled={redirecting || name.trim().length === 0}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {redirecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <AtSign className="h-4 w-4" />
        )}
        {redirecting ? 'Redirecionando...' : 'Conectar com o Threads'}
      </button>
    </div>
  );
}
