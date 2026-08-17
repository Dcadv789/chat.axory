'use client';

import { resolverAvatar } from '../avatar-do-agente';

/** Avatar do agente: emoji escolhido, imagem, ou iniciais coloridas. */
export function AvatarAgente({
  nome,
  avatarUrl,
  tamanho = 'md',
  className = '',
}: {
  nome: string;
  avatarUrl?: string | null;
  tamanho?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const avatar = resolverAvatar(nome, avatarUrl);
  const caixa =
    tamanho === 'sm'
      ? 'h-8 w-8 text-[11px]'
      : tamanho === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-10 w-10 text-xs';
  const emojiTam =
    tamanho === 'sm' ? 'text-base' : tamanho === 'lg' ? 'text-2xl' : 'text-xl';

  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${caixa} ${className}`;

  if (avatar.tipo === 'emoji') {
    return (
      <div
        className={`${base} border border-zinc-200/70 bg-zinc-50 dark:border-white/10 dark:bg-white/[0.06]`}
      >
        <span className={emojiTam} aria-hidden>
          {avatar.emoji}
        </span>
      </div>
    );
  }

  if (avatar.tipo === 'imagem') {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={avatar.url}
        alt={nome}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${base} font-semibold text-white`}
      style={{ backgroundColor: avatar.cor }}
      aria-hidden
    >
      {avatar.texto}
    </div>
  );
}
