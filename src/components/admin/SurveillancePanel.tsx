import { Badge } from "@/components/ui/badge";
import { LIBELLES_ETAT, type EtatTache, type LigneSurveillance } from "@/lib/gardien-envois/surveillance";

const VARIANTES: Record<EtatTache, "default" | "secondary" | "destructive" | "outline"> = {
  en_echec: "destructive",
  en_retard: "destructive",
  jamais: "secondary",
  inactive: "outline",
  a_l_heure: "default",
};

const dateHeure = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso))
    : "jamais";

/** État des tâches planifiées (onglet « Surveillance » du superadmin). */
export function SurveillancePanel({
  lignes,
  appelsHttp,
}: {
  lignes: LigneSurveillance[];
  appelsHttp: { echecs_6h: number; total_6h: number } | null;
}) {
  if (!lignes.length) {
    return <p className="text-muted-foreground text-sm">Aucune tâche planifiée trouvée.</p>;
  }
  return (
    <div className="space-y-3">
      {appelsHttp && (
        <p className="text-muted-foreground text-sm">
          Appels des fonctions sur 6 h : {appelsHttp.total_6h}, dont {appelsHttp.echecs_6h} en échec.
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {lignes.map((l) => (
          <li key={l.cle} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{l.libelle}</p>
              <p className="text-muted-foreground text-xs">
                Dernier passage : {dateHeure(l.dernierPassage)}
                {l.echecs24h > 0 ? ` · ${l.echecs24h} échec${l.echecs24h > 1 ? "s" : ""} sur 24 h` : ""}
              </p>
              {l.detail && <p className="text-destructive mt-1 text-xs break-words">{l.detail}</p>}
            </div>
            <Badge variant={VARIANTES[l.etat]} className="self-start sm:self-center">
              {LIBELLES_ETAT[l.etat]}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
