/** Placeholder de carregamento (shimmer). Use com className pra dar tamanho. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-200 dark:bg-white/10 ${className}`} />;
}
