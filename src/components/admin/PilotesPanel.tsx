"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { creerPilote, majPilote } from "@/app/(dashboard)/admin/actions";
import { quantite } from "@/lib/gardien-envois/format";

export interface PiloteSuivi {
  id: string;
  site: string;
  organisation: string;
  debut: string;
  fin: string;
  joursRestants: number;
  statut: string;
  anomalies: number;
  consentement: string | null;
  remboursement: boolean;
  prochaineAction: string;
}

const STATUTS: Record<string, string> = {
  en_cours: "En cours",
  prolonge: "Prolongé",
  converti: "Converti",
  retire: "Retiré",
};

function LignePilote({ p }: { p: PiloteSuivi }) {
  const [action, setAction] = useState(p.prochaineAction);
  const [statut, setStatut] = useState(p.statut);
  const [fin, setFin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    setEnCours(true);
    const r = await majPilote({
      piloteId: p.id,
      prochaineAction: action,
      statut: statut as "en_cours" | "prolonge" | "retire" | "converti",
      finProlongee: statut === "prolonge" && fin ? fin : null,
    });
    setEnCours(false);
    setMessage("erreur" in r ? r.erreur : "Enregistré.");
  }

  return (
    <li className="space-y-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {p.site} — {p.organisation}
        </span>
        <Badge variant={p.statut === "en_cours" ? "default" : "secondary"}>{STATUTS[p.statut] ?? p.statut}</Badge>
        {p.statut === "en_cours" && <span className="text-muted-foreground">{p.joursRestants} jours restants</span>}
      </div>
      <p className="text-muted-foreground">
        Du {p.debut} au {p.fin} · {quantite(p.anomalies, "anomalie trouvée", "anomalies trouvées")} ·{" "}
        {p.consentement ? `conversion acceptée (${p.consentement})` : "pas d'accord écrit de conversion : appel à prévoir"}
        {p.remboursement ? " · remboursement si rien n'est trouvé" : ""}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`action-${p.id}`}>Prochaine action</Label>
          <Input id={`action-${p.id}`} className="w-72" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <Select items={STATUTS} value={statut} onValueChange={(v) => v && setStatut(v)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUTS).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {statut === "prolonge" && (
          <div className="space-y-1">
            <Label htmlFor={`fin-${p.id}`}>Nouvelle fin</Label>
            <Input id={`fin-${p.id}`} type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        )}
        <Button size="sm" variant="outline" disabled={enCours} onClick={enregistrer}>
          Enregistrer
        </Button>
        {message && <span className="text-muted-foreground">{message}</span>}
      </div>
    </li>
  );
}

export function PilotesPanel({ pilotes, sites }: { pilotes: PiloteSuivi[]; sites: { id: string; name: string }[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [debut, setDebut] = useState(new Date().toISOString().slice(0, 10));
  const [duree, setDuree] = useState("30");
  const [remboursement, setRemboursement] = useState(false);
  const [action, setAction] = useState("");
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    const r = await creerPilote({ siteId, debut, dureeJours: Number(duree), remboursementSiRien: remboursement, prochaineAction: action });
    setEnCours(false);
    setRetour("erreur" in r ? { ok: false, texte: r.erreur } : { ok: true, texte: "Pilote créé." });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={creer} className="space-y-3 rounded-lg border p-3">
        <p className="font-medium">Nouveau pilote</p>
        <div className="flex flex-wrap items-end gap-3">
          <Select items={Object.fromEntries(sites.map((s) => [s.id, s.name]))} value={siteId} onValueChange={(v) => v && setSiteId(v)}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <Label htmlFor="pilote-debut">Début</Label>
            <Input id="pilote-debut" type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pilote-duree">Durée (jours)</Label>
            <Input id="pilote-duree" className="w-24" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pilote-action">Prochaine action</Label>
            <Input id="pilote-action" className="w-64" value={action} onChange={(e) => setAction(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remboursement} onChange={(e) => setRemboursement(e.target.checked)} />
          Rembourser la mise en service et retirer le capteur si rien n&apos;est trouvé
        </label>
        <p className="text-muted-foreground text-xs">
          L&apos;accord écrit de conversion est donné par le client lui-même, sur la page de son site.
        </p>
        <Button type="submit" disabled={enCours || !siteId}>
          Créer le pilote
        </Button>
        {retour && (
          <Alert variant={retour.ok ? "default" : "destructive"}>
            <AlertDescription>{retour.texte}</AlertDescription>
          </Alert>
        )}
      </form>
      {pilotes.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucun pilote pour l&apos;instant.</p>
      ) : (
        <ul className="space-y-3">
          {pilotes.map((p) => (
            <LignePilote key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  );
}
