import { Skeleton } from "@/components/ui/skeleton";

/** Squelette commun des pages du Gardien : titre, grand chiffre, blocs. */
export function ChargementPage({ blocs = 3 }: { blocs?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Chargement">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-16 w-40" />
      {Array.from({ length: blocs }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
