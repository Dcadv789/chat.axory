'use client';

import { useState } from 'react';
import { Loader2, X, UserPlus, Copy, Check, Link as LinkIcon, Shield, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { membersService } from '@/features/settings/services/members.service';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Chamado após convidar/adicionar com sucesso (pra refetch da lista). */
  onInvited?: () => void;
}

const ROLE_OPTIONS: { value: string; label: string; icon: React.ElementType; hint: string }[] = [
  { value: 'AGENT', label: 'Agente', icon: UserIcon, hint: 'Atende conversas dos canais liberados.' },
  { value: 'ADMIN', label: 'Admin', icon: Shield, hint: 'Gerencia a organização, membros e configurações.' },
];

/**
 * Drawer de convidar membro. Cria o convite (ou adiciona direto, se o e-mail
 * já for de um usuário) e, quando gera link, mostra pra copiar.
 * Mesmo padrão visual do MemberChannelsDrawer.
 */
export function InviteMemberDrawer({ open, onClose, onInvited }: Props) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('AGENT');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const reset = () => {
    setEmail('');
    setRole('AGENT');
    setInviteLink(null);
    setCopied(false);
  };
  const close = () => { reset(); onClose(); };

  const handleInvite = async () => {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const result = await membersService.invite({ email: email.trim(), role });
      onInvited?.();
      if (result?.autoAccepted) {
        toast.success('Membro adicionado com sucesso!');
        close();
      } else {
        setInviteLink(`${window.location.origin}/register?invite=${result.token}`);
        setEmail('');
        toast.success('Convite criado! Compartilhe o link com o membro.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao convidar');
    } finally {
      setInviting(false);
    }
  };

  const copy = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={close} />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-black">
        <header className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Convidar membro</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Convide alguém para a sua organização. Se a pessoa já tiver conta, entra na hora.
            </p>
          </div>
          <button
            onClick={close}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                E-mail do membro
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="email@exemplo.com"
                autoFocus
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-white/5 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Papel na organização
              </label>
              <div className="space-y-2">
                {ROLE_OPTIONS.map((opt) => {
                  const active = role === opt.value;
                  return (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        active
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-zinc-200 hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="radio"
                        name="invite-role"
                        value={opt.value}
                        checked={active}
                        onChange={() => setRole(opt.value)}
                        className="mt-0.5 h-4 w-4 border-zinc-300 text-primary focus:ring-primary dark:border-zinc-600 dark:bg-black"
                      />
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          <opt.icon className="h-3.5 w-3.5" />{opt.label}
                        </span>
                        <p className="text-xs text-zinc-500">{opt.hint}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {inviteLink && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 dark:border-primary/30 dark:bg-primary/10">
                <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  <LinkIcon className="h-3.5 w-3.5 text-primary" /> Link de convite (expira em 7 dias)
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    className="w-full truncate rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                  />
                  <button
                    onClick={copy}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-white/10">
          <button
            onClick={close}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/10"
          >
            {inviteLink ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            onClick={handleInvite}
            disabled={!email.trim() || inviting}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {inviteLink ? 'Convidar outro' : 'Convidar'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
