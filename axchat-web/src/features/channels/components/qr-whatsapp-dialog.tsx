'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Smartphone, X } from 'lucide-react';
import {
  channelsService,
  type ConexaoWhatsapp,
} from '@/features/channels/services/channels.service';

/**
 * O QR do WhatsApp vale cerca de 20 segundos. Renovamos um pouco antes pra
 * nunca haver um código morto na tela — quem está com o celular na mão
 * apontando pra um QR expirado não tem como saber que o problema é esse.
 */
const RENOVAR_QR_MS = 18_000;
const CONSULTAR_STATUS_MS = 3_000;

interface Props {
  channelId: string;
  channelName: string;
  onClose: () => void;
  onConectado?: () => void;
}

export function QrWhatsappDialog({
  channelId,
  channelName,
  onClose,
  onConectado,
}: Props) {
  const [conexao, setConexao] = useState<ConexaoWhatsapp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const jaAvisou = useRef(false);

  const pedirQr = async () => {
    try {
      setErro(null);
      const r = await channelsService.conectarWhatsappNaoOficial(channelId);
      setConexao(r);
    } catch (e: any) {
      setErro(
        e?.response?.data?.message ??
          'Não consegui falar com o servidor do WhatsApp. Tente de novo em instantes.',
      );
    } finally {
      setCarregando(false);
    }
  };

  // Primeiro QR ao abrir.
  useEffect(() => {
    void pedirQr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Renova o QR enquanto ninguém escaneou.
  useEffect(() => {
    if (conexao?.status === 'CONECTADO') return;
    const t = setInterval(() => void pedirQr(), RENOVAR_QR_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conexao?.status, channelId]);

  // Pergunta ao servidor se já pareou. É este laço que fecha a tela sozinho
  // quando o cliente escaneia — sem ele, ele ficaria olhando o QR sem saber
  // que já deu certo.
  useEffect(() => {
    if (conexao?.status === 'CONECTADO') return;
    const t = setInterval(async () => {
      try {
        const r = await channelsService.statusWhatsappNaoOficial(channelId);
        setConexao((antes) => ({ ...(antes ?? r), ...r, qrCode: r.qrCode ?? antes?.qrCode ?? null }));
      } catch {
        // Falha de rede numa consulta não derruba a tela: a próxima tenta de novo.
      }
    }, CONSULTAR_STATUS_MS);
    return () => clearInterval(t);
  }, [conexao?.status, channelId]);

  useEffect(() => {
    if (conexao?.status === 'CONECTADO' && !jaAvisou.current) {
      jaAvisou.current = true;
      onConectado?.();
    }
  }, [conexao?.status, onConectado]);

  const conectado = conexao?.status === 'CONECTADO';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-black">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
              Conectar {channelName}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Use o WhatsApp do celular que vai atender por este canal.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {conectado ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                WhatsApp conectado
              </p>
              {conexao?.connectedNumber && (
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Número {conexao.connectedNumber}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Concluir
            </button>
          </div>
        ) : erro ? (
          <div className="space-y-3 py-4">
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {erro}
            </p>
            <button
              onClick={() => {
                setCarregando(true);
                void pedirQr();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Tentar de novo
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="relative flex h-56 w-56 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-white/10">
                {carregando || !conexao?.qrCode ? (
                  <Loader2 className="h-7 w-7 animate-spin text-zinc-300" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={conexao.qrCode}
                    alt="QR code para conectar o WhatsApp"
                    className="h-52 w-52"
                  />
                )}
              </div>
            </div>

            <ol className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <li className="flex gap-2">
                <span className="font-semibold text-primary">1.</span>
                Abra o WhatsApp no celular.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">2.</span>
                Toque em <strong>Configurações</strong> e depois em{' '}
                <strong>Aparelhos conectados</strong>.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-primary">3.</span>
                Toque em <strong>Conectar um aparelho</strong> e aponte a câmera
                para o código acima.
              </li>
            </ol>

            <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
              <Smartphone className="h-3 w-3" />
              O código se renova sozinho. Esta janela fecha quando conectar.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
