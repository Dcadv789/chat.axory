'use client';

import { useEffect, useState } from 'react';
import { Loader2, QrCode, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import {
  channelsService,
  type StatusDoWhatsapp,
} from '@/features/channels/services/channels.service';
import { QrWhatsappDialog } from './qr-whatsapp-dialog';
import { useAuthStore } from '@/stores/auth-store';

const APARENCIA: Record<
  StatusDoWhatsapp,
  { texto: string; classe: string; ponto: string }
> = {
  CONECTADO: {
    texto: 'Conectado',
    classe: 'text-emerald-700 dark:text-emerald-400',
    ponto: 'bg-emerald-500',
  },
  CONECTANDO: {
    texto: 'Conectando…',
    classe: 'text-amber-700 dark:text-amber-400',
    ponto: 'bg-amber-500',
  },
  DESCONECTADO: {
    texto: 'Desconectado',
    classe: 'text-red-700 dark:text-red-400',
    ponto: 'bg-red-500',
  },
};

/**
 * Estado do WhatsApp não oficial dentro do canal.
 *
 * Este cartão é o que evita o pior modo de falha do canal não oficial: o
 * celular despareia (troca de aparelho, WhatsApp reinstalado, sessão removida
 * à mão) e ninguém percebe até um cliente reclamar que ficou sem resposta.
 * Aqui o estado fica à vista e reconectar é um clique.
 */
export function ConexaoWhatsappCard({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  // Conectar é trabalho de quem opera o canal; desconectar derruba o WhatsApp
  // da empresa inteira, então fica com quem administra — o mesmo corte que o
  // backend aplica na rota.
  const { organizations, activeOrgId } = useAuthStore();
  const papel = organizations.find((o) => o.id === activeOrgId)?.role;
  const podeDesconectar = papel === 'OWNER' || papel === 'ADMIN';
  const [status, setStatus] = useState<StatusDoWhatsapp | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  const [abrindoQr, setAbrindoQr] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const consultar = async () => {
    try {
      const r = await channelsService.statusWhatsappNaoOficial(channelId);
      setStatus(r.status);
      setNumero(r.connectedNumber);
    } catch {
      // Servidor fora do ar não deve quebrar o painel inteiro do canal.
      setStatus(null);
    }
  };

  useEffect(() => {
    void consultar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  const desconectar = async () => {
    setOcupado(true);
    try {
      await channelsService.desconectarWhatsappNaoOficial(channelId);
      toast.success('WhatsApp desconectado.');
      await consultar();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Não consegui desconectar.');
    } finally {
      setOcupado(false);
    }
  };

  const aparencia = status ? APARENCIA[status] : null;

  return (
    <>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-black">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Conexão do WhatsApp
            </p>
            <div className="mt-1 flex items-center gap-2">
              {aparencia ? (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full ${aparencia.ponto}`} />
                  <span className={`text-xs font-medium ${aparencia.classe}`}>
                    {aparencia.texto}
                  </span>
                  {numero && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      · {numero}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Verificando…
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
              {status !== 'CONECTADO' && (
                <button
                  onClick={() => setAbrindoQr(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  {status === 'DESCONECTADO' ? 'Conectar' : 'Ver QR code'}
                </button>
              )}
              {status === 'CONECTADO' && podeDesconectar && (
                <button
                  onClick={desconectar}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white disabled:opacity-50 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5"
                >
                  {ocupado ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unplug className="h-3.5 w-3.5" />
                  )}
                  Desconectar
                </button>
              )}
          </div>
        </div>

        {status === 'DESCONECTADO' && (
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            Enquanto estiver desconectado, este canal não envia nem recebe
            mensagens. Conecte lendo o QR code com o celular.
          </p>
        )}
      </div>

      {abrindoQr && (
        <QrWhatsappDialog
          channelId={channelId}
          channelName={channelName}
          onConectado={consultar}
          onClose={() => {
            setAbrindoQr(false);
            void consultar();
          }}
        />
      )}
    </>
  );
}
