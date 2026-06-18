'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  superAdminService,
  type SuperAdminOrganization,
  type SuperAdminUser,
} from '../services/super-admin.service';

interface EditUserDialogProps {
  user: SuperAdminUser | null;
  organizations: SuperAdminOrganization[];
  onClose: () => void;
  onSaved: () => void;
}

const roleOptions = ['OWNER', 'ADMIN', 'AGENT'];

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-500';

const selectCls =
  'rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-primary dark:border-white/15 dark:bg-black dark:text-zinc-100';

export function EditUserDialog({
  user,
  organizations,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [memberships, setMemberships] = useState<SuperAdminUser['organizations']>([]);
  const [newOrgId, setNewOrgId] = useState('');
  const [newRole, setNewRole] = useState('AGENT');
  const [saving, setSaving] = useState(false);
  const [addingOrg, setAddingOrg] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPassword('');
    setIsActive(user.isActive);
    setIsSuperAdmin(user.isSuperAdmin);
    setMemberships(user.organizations);
    setNewOrgId('');
    setNewRole('AGENT');
  }, [user]);

  const availableOrganizations = useMemo(() => {
    const memberOrgIds = new Set(memberships.map((m) => m.organization.id));
    return organizations.filter((org) => !memberOrgIds.has(org.id));
  }, [memberships, organizations]);

  if (!user) return null;

  const updateMembershipRole = async (membership: SuperAdminUser['organizations'][number], role: string) => {
    try {
      await superAdminService.updateOrganizationMember(membership.organization.id, membership.id, { role });
      setMemberships((current) =>
        current.map((item) => (item.id === membership.id ? { ...item, role } : item)),
      );
      toast.success('Permissao atualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar permissao');
    }
  };

  const removeMembership = async (membership: SuperAdminUser['organizations'][number]) => {
    if (!confirm(`Remover ${user.name} de ${membership.organization.name}?`)) return;
    try {
      await superAdminService.removeOrganizationMember(membership.organization.id, membership.id);
      setMemberships((current) => current.filter((item) => item.id !== membership.id));
      toast.success('Empresa removida');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao remover empresa');
    }
  };

  const addMembership = async () => {
    if (!newOrgId) {
      toast.error('Selecione uma empresa');
      return;
    }
    setAddingOrg(true);
    try {
      const created = await superAdminService.addOrganizationMember(newOrgId, {
        email: user.email,
        role: newRole,
      });
      const org = organizations.find((item) => item.id === newOrgId);
      if (org) {
        setMemberships((current) => [
          ...current,
          {
            id: created.id,
            role: created.role,
            joinedAt: created.joinedAt ?? new Date().toISOString(),
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
              plan: org.plan,
              status: org.status,
            },
          },
        ]);
      }
      setNewOrgId('');
      setNewRole('AGENT');
      toast.success('Usuario adicionado a empresa');
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar empresa');
    } finally {
      setAddingOrg(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      toast.error('Nome e email sao obrigatorios');
      return;
    }
    if (password && password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }

    setSaving(true);
    try {
      await superAdminService.updateUser(user.id, {
        name: name.trim(),
        email: email.trim(),
        ...(password ? { password } : {}),
        isActive,
        isSuperAdmin,
      });
      toast.success('Usuario atualizado');
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar usuario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative z-50 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Editar usuario</h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Um usuario pode participar de varias empresas com roles diferentes.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto bg-[#f8fafc] px-6 py-5 dark:bg-[#171717]">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome" value={name} onChange={setName} />
              <Field label="Email" value={email} onChange={setEmail} type="email" />
              <Field
                label="Nova senha"
                value={password}
                onChange={setPassword}
                type="password"
                placeholder="deixe em branco para manter"
                className="sm:col-span-2"
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-4 dark:border-white/10">
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                />
                Usuario ativo
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                <input
                  type="checkbox"
                  checked={isSuperAdmin}
                  onChange={(e) => setIsSuperAdmin(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-primary focus:ring-primary dark:border-white/20"
                />
                Super admin
              </label>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
            <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Empresas vinculadas</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Adicione ou remova empresas. No login, o usuario vera todas as empresas em que participa.
            </p>

            {memberships.length === 0 ? (
              <p className="mt-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-white/15 dark:bg-white/5 dark:text-zinc-400">
                Nenhuma empresa vinculada
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {memberships.map((membership) => (
                  <div
                    key={membership.id ?? `${user.id}:${membership.organization.id}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-white/15 dark:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {membership.organization.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {membership.organization.slug} · {membership.organization.plan}
                      </p>
                    </div>
                    <select
                      value={membership.role}
                      onChange={(event) => updateMembershipRole(membership, event.target.value)}
                      className={selectCls}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeMembership(membership)}
                      className="rounded-md border border-transparent p-1.5 text-zinc-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900/40 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      title="Remover desta empresa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 dark:border-white/15 dark:bg-[#171717]">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Adicionar empresa
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Empresa</span>
                  <select
                    value={newOrgId}
                    onChange={(event) => setNewOrgId(event.target.value)}
                    className={`${inputCls} py-2`}
                  >
                    <option value="">Selecione...</option>
                    {availableOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.slug})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-32">
                  <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Role</span>
                  <select
                    value={newRole}
                    onChange={(event) => setNewRole(event.target.value)}
                    className={`${inputCls} py-2`}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={addMembership}
                  disabled={addingOrg || !newOrgId || availableOrganizations.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {addingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Adicionar
                </button>
              </div>
              {availableOrganizations.length === 0 && memberships.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Este usuario ja participa de todas as empresas listadas.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 bg-white px-6 py-4 dark:border-white/10 dark:bg-black">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alteracoes
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={inputCls}
      />
    </label>
  );
}
