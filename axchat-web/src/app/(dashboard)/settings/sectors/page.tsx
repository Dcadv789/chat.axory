'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Star,
  Users as UsersIcon,
  Loader2,
  UserPlus,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import {
  departmentsService,
  type Department,
} from '@/features/settings/services/departments.service';
import { membersService } from '@/features/settings/services/members.service';
import { aiSettingsService } from '@/features/ai-agents/services/ai-settings.service';

export default function SettingsSectorsPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) =>
    s.organizations.find((o) => o.id === s.activeOrgId)?.role,
  );
  const isManager = role === 'OWNER' || role === 'ADMIN';

  const {
    data: departments = [],
    isLoading,
    isError,
    refetch: refetchList,
  } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsService.list(),
    enabled: isManager,
  });

  const { data: aiSettings } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => aiSettingsService.get(),
    enabled: isManager,
  });

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const refetch = () =>
    qc.invalidateQueries({ queryKey: ['departments'] });

  if (!isManager) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-white/10 dark:bg-black">
        Só proprietários e admins podem gerenciar setores.
      </div>
    );
  }

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await departmentsService.create({ name });
      toast.success('Setor criado');
      setNewName('');
      refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao criar setor');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleLock = async (next: boolean) => {
    setSavingToggle(true);
    try {
      await aiSettingsService.update({ routeAllToDefaultSector: next });
      toast.success('Configuração salva');
      qc.invalidateQueries({ queryKey: ['ai-settings'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setSavingToggle(false);
    }
  };

  const hasDefault = departments.some((d) => d.isDefault);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
      {/* Trava no setor padrão */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Enviar tudo pro setor padrão
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Quando ligado, a IA orquestradora joga toda conversa que precisa de
              humano no setor marcado como padrão, sem distribuir entre setores.
              Desligado, a IA escolhe o setor pela necessidade do cliente e usa o
              padrão só como fallback.
            </p>
          </div>
          <Toggle
            checked={!!aiSettings?.routeAllToDefaultSector}
            disabled={savingToggle}
            onChange={handleToggleLock}
          />
        </label>
        {!hasDefault && departments.length > 0 && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            Nenhum setor está marcado como padrão. Marque um com a estrela — é
            pra onde caem as conversas sem setor e quando a IA está desligada.
          </p>
        )}
      </section>

      {/* Criar setor */}
      <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-black">
        <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Novo setor
        </p>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Ex.: Atendimento, Vendas, Financeiro"
            className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:border-white/10 dark:bg-black dark:text-zinc-100"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Criar
          </button>
        </div>
      </section>
      </div>

      {/* Lista de setores */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <p>Não foi possível carregar os setores.</p>
          <button
            onClick={() => refetchList()}
            className="mt-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Tentar novamente
          </button>
        </div>
      ) : departments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-black">
          Nenhum setor ainda. Crie o primeiro acima.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {departments.map((dept) => (
            <DepartmentCard key={dept.id} dept={dept} onChanged={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function DepartmentCard({
  dept,
  onChanged,
}: {
  dept: Department;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(dept.name);
  const [busy, setBusy] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const save = async (patch: { name?: string; isDefault?: boolean }) => {
    setBusy(true);
    try {
      await departmentsService.update(dept.id, patch);
      toast.success('Setor atualizado');
      setEditing(false);
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao salvar');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Excluir o setor "${dept.name}"?`)) return;
    setBusy(true);
    try {
      await departmentsService.remove(dept.id);
      toast.success('Setor excluído');
      qc.invalidateQueries({ queryKey: ['departments'] });
      onChanged();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao excluir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save({ name: name.trim() })}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-white/10 dark:bg-black dark:text-zinc-100"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {dept.name}
            </span>
          )}
          {dept.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              <Star className="h-3 w-3 fill-current" /> Padrão
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => save({ name: name.trim() })}
                disabled={busy || !name.trim()}
                className="rounded-md p-1.5 text-green-600 hover:bg-green-50 disabled:opacity-50 dark:hover:bg-green-500/10"
                title="Salvar"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(dept.name);
                }}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowMembers((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                title="Atendentes do setor"
              >
                <UsersIcon className="h-3.5 w-3.5" /> Atendentes
              </button>
              {!dept.isDefault && (
                <button
                  onClick={() => save({ isDefault: true })}
                  disabled={busy}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50 dark:hover:bg-amber-500/10"
                  title="Marcar como padrão"
                >
                  <Star className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setEditing(true)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                title="Renomear"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {showMembers && <DepartmentMembers dept={dept} />}
    </div>
  );
}

function DepartmentMembers({ dept }: { dept: Department }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['department-agents', dept.id],
    queryFn: () => departmentsService.listAgents(dept.id),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['org-members'],
    queryFn: () => membersService.list(),
    staleTime: 60_000,
  });

  const memberUserIds = new Set(
    agents.map((a) => a.userOrganization.user.id),
  );
  const candidates = members.filter(
    (m) => m.user.isActive && !memberUserIds.has(m.user.id),
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['department-agents', dept.id] });

  const add = async (userId: string) => {
    setBusyId(userId);
    try {
      await departmentsService.addAgent(dept.id, userId);
      toast.success('Atendente adicionado');
      invalidate();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao adicionar');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (userId: string) => {
    setBusyId(userId);
    try {
      await departmentsService.removeAgent(dept.id, userId);
      toast.success('Atendente removido');
      invalidate();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao remover');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-white/10">
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        </div>
      ) : (
        <>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Nesta fila
          </p>
          {agents.length === 0 ? (
            <p className="mb-2 text-xs text-zinc-400">
              Nenhum atendente neste setor ainda.
            </p>
          ) : (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-1 pl-2.5 pr-1 text-xs text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
                >
                  {a.userOrganization.user.name}
                  <button
                    onClick={() => remove(a.userOrganization.user.id)}
                    disabled={busyId === a.userOrganization.user.id}
                    className="rounded-full p-0.5 text-zinc-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/20"
                    title="Remover do setor"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {candidates.length > 0 && (
            <>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                Adicionar
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((m) => (
                  <button
                    key={m.user.id}
                    onClick={() => add(m.user.id)}
                    disabled={busyId === m.user.id}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-primary hover:text-primary disabled:opacity-50 dark:border-white/10 dark:text-zinc-300"
                  >
                    <UserPlus className="h-3 w-3" /> {m.user.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}
