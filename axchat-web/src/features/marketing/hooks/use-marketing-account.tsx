'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketingService, type MarketingAccount } from '../services/marketing.service';

interface MarketingAccountContext {
  accounts: MarketingAccount[];
  /** `undefined` = credenciais da empresa (comportamento antigo). */
  channelId?: string;
  setChannelId: (id?: string) => void;
  current?: MarketingAccount;
  loading: boolean;
}

const Ctx = createContext<MarketingAccountContext>({
  accounts: [],
  setChannelId: () => {},
  loading: false,
});

const chave = (orgId: string | null) => `marketing-account:${orgId ?? 'sem-org'}`;

/**
 * Conta de Instagram sobre a qual o painel de marketing age.
 *
 * Antes as credenciais eram uma tripla por empresa e a última conexão
 * sobrescrevia as anteriores: conectar um segundo perfil roubava o marketing
 * do primeiro, sem nada na tela indicar isso. O inbox sempre soube separar por
 * canal; aqui a separação não existia.
 *
 * A escolha fica por empresa no navegador — trocar de empresa não pode herdar
 * a conta da anterior, que nem existe lá.
 */
export function MarketingAccountProvider({ children }: { children: ReactNode }) {
  const [channelId, setChannelIdState] = useState<string | undefined>(undefined);
  const [hidratado, setHidratado] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-accounts'],
    queryFn: () => marketingService.listAccounts(),
    staleTime: 60000,
  });
  const accounts = useMemo(() => data?.accounts ?? [], [data]);

  useEffect(() => {
    if (hidratado || accounts.length === 0) return;
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(chave(localStorage.getItem('active_org_id')));
    } catch {
      salvo = null;
    }
    // Só aceita o que ainda existe: canal removido ou de outra empresa faria o
    // painel pedir uma conta que o backend recusa.
    const valido = accounts.find((a) => a.channelId === salvo);
    setChannelIdState(valido ? valido.channelId : accounts[0]?.channelId);
    setHidratado(true);
  }, [accounts, hidratado]);

  const setChannelId = (id?: string) => {
    setChannelIdState(id);
    try {
      const k = chave(localStorage.getItem('active_org_id'));
      if (id) localStorage.setItem(k, id);
      else localStorage.removeItem(k);
    } catch {
      /* navegador sem storage — a escolha só não persiste */
    }
  };

  const current = accounts.find((a) => a.channelId === channelId);

  return (
    <Ctx.Provider
      value={{ accounts, channelId, setChannelId, current, loading: isLoading }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useMarketingAccount() {
  return useContext(Ctx);
}
