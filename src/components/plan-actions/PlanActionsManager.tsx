"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Plan {
  id: string;
  nom: string;
  description: string | null;
  annee_debut: number | null;
  annee_fin: number | null;
  statut: string;
}

interface CatalogueItem {
  id: string;
  categorie: string;
  titre: string;
  description: string | null;
  is_system: boolean;
}

interface ActionRow {
  id: string;
  titre: string;
  statut: string;
  priorite: string;
  echeance: string | null;
  categorie: string | null;
}

const LABEL_CATEGORIE: Record<string, string> = {
  sectorisation: "Sectorisation",
  recherche_fuites: "Recherche de fuites",
  renouvellement: "Renouvellement",
  gestion_pression: "Gestion de pression",
  compteurs_sectorisation: "Compteurs de sectorisation",
  telereleve: "Télérelève",
};

const STATUTS_ACTION = [
  { value: "a_faire", label: "À faire" },
  { value: "en_cours", label: "En cours" },
  { value: "terminee", label: "Terminée" },
  { value: "annulee", label: "Annulée" },
] as const;

const PRIORITES = [
  { value: "faible", label: "Faible" },
  { value: "moyenne", label: "Moyenne" },
  { value: "haute", label: "Haute" },
] as const;

function extraireCategorie(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { categorie?: string } | undefined)?.categorie ?? null;
  return (rel as { categorie?: string } | null)?.categorie ?? null;
}

export function PlanActionsManager({
  organizationId,
  plans,
  catalogue,
  peutGererPlans,
  peutSuivreActions,
  supabaseUrl,
}: {
  organizationId: string;
  plans: Plan[];
  catalogue: CatalogueItem[];
  peutGererPlans: boolean;
  peutSuivreActions: boolean;
  supabaseUrl: string;
}) {
  const router = useRouter();
  const [planId, setPlanId] = useState(
    plans.find((p) => p.statut === "actif")?.id ?? plans[0]?.id ?? "",
  );
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [ouvertPlan, setOuvertPlan] = useState(false);
  const [ouvertCatalogue, setOuvertCatalogue] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  const chargerActions = useCallback(async (id: string): Promise<ActionRow[]> => {
    if (!id) return [];
    const supabase = createClient();
    const { data } = await supabase
      .from("actions")
      .select("id, titre, statut, priorite, echeance, catalogue_actions_types(categorie)")
      .eq("action_plan_id", id)
      .order("echeance", { nullsFirst: false });
    return (data ?? []).map((a) => ({
      id: a.id,
      titre: a.titre,
      statut: a.statut,
      priorite: a.priorite,
      echeance: a.echeance,
      categorie: extraireCategorie(a.catalogue_actions_types),
    }));
  }, []);

  useEffect(() => {
    let annule = false;
    void (async () => {
      const donnees = await chargerActions(planId);
      if (!annule) setActions(donnees);
    })();
    return () => {
      annule = true;
    };
  }, [planId, chargerActions]);

  const planActuel = plans.find((p) => p.id === planId);

  async function majAction(id: string, champs: Partial<Pick<ActionRow, "statut" | "priorite" | "echeance">>) {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...champs } : a)));
    const supabase = createClient();
    await supabase.from("actions").update(champs).eq("id", id);
    router.refresh();
  }

  async function supprimerAction(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id));
    const supabase = createClient();
    await supabase.from("actions").delete().eq("id", id);
  }

  async function ajouterDepuisCatalogue(item: CatalogueItem, echeance: string) {
    if (!planId) return;
    const supabase = createClient();
    const { error } = await supabase.from("actions").insert({
      organization_id: organizationId,
      action_plan_id: planId,
      catalogue_action_type_id: item.id,
      titre: item.titre,
      description: item.description,
      echeance: echeance || null,
    });
    if (!error) {
      setActions(await chargerActions(planId));
      setOuvertCatalogue(false);
    }
  }

  async function exporterPdf() {
    if (!planId) return;
    setExportEnCours(true);
    setErreur(null);
    try {
      const reponse = await fetch(`${supabaseUrl}/functions/v1/reports/plan-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionPlanId: planId }),
      });
      const resultat = await reponse.json();
      if (!reponse.ok || !resultat.filePath) {
        setErreur(resultat.erreur ?? "Export impossible");
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("rapports")
        .createSignedUrl(resultat.filePath, 60);
      if (data) window.open(data.signedUrl, "_blank");
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label>Plan</Label>
          <Select value={planId} onValueChange={(v) => v && setPlanId(v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Choisir un plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nom} ({p.statut})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {peutGererPlans && <CreerPlanDialog organizationId={organizationId} ouvert={ouvertPlan} onOuvertChange={setOuvertPlan} />}

        {planId && (
          <>
            <Button type="button" variant="outline" onClick={() => setOuvertCatalogue(true)}>
              + Action du catalogue
            </Button>
            <Button type="button" variant="outline" onClick={exporterPdf} disabled={exportEnCours}>
              {exportEnCours ? "Export…" : "Export PDF"}
            </Button>
          </>
        )}
      </div>

      {planActuel?.description && (
        <p className="text-muted-foreground text-sm">{planActuel.description}</p>
      )}

      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {planId ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Échéance</TableHead>
                {peutSuivreActions && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {actions.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-64">{a.titre}</TableCell>
                  <TableCell>
                    {a.categorie ? (LABEL_CATEGORIE[a.categorie] ?? a.categorie) : "—"}
                  </TableCell>
                  <TableCell>
                    {peutSuivreActions ? (
                      <Select
                        value={a.priorite}
                        onValueChange={(v) => v && majAction(a.id, { priorite: v })}
                      >
                        <SelectTrigger size="sm" className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITES.map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline">{a.priorite}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {peutSuivreActions ? (
                      <Select
                        value={a.statut}
                        onValueChange={(v) => v && majAction(a.id, { statut: v })}
                      >
                        <SelectTrigger size="sm" className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUTS_ACTION.map((s) => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={a.statut === "terminee" ? "secondary" : "outline"}>
                        {a.statut}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {peutSuivreActions ? (
                      <Input
                        type="date"
                        value={a.echeance ?? ""}
                        onChange={(e) => majAction(a.id, { echeance: e.target.value || null })}
                        className="w-36"
                      />
                    ) : (
                      (a.echeance ?? "—")
                    )}
                  </TableCell>
                  {peutSuivreActions && (
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => supprimerAction(a.id)}
                      >
                        Retirer
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {actions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={peutSuivreActions ? 6 : 5}
                    className="text-muted-foreground text-center"
                  >
                    Aucune action dans ce plan.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {peutGererPlans
            ? "Créez un premier plan pour commencer."
            : "Aucun plan d'actions pour l'instant."}
        </p>
      )}

      {ouvertCatalogue && planId && (
        <CatalogueDialog
          catalogue={catalogue}
          ouvert={ouvertCatalogue}
          onOuvertChange={setOuvertCatalogue}
          onAjouter={ajouterDepuisCatalogue}
        />
      )}
    </div>
  );
}

function CreerPlanDialog({
  organizationId,
  ouvert,
  onOuvertChange,
}: {
  organizationId: string;
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const anneeCourante = new Date().getFullYear();
  const [anneeDebut, setAnneeDebut] = useState(anneeCourante.toString());
  const [anneeFin, setAnneeFin] = useState((anneeCourante + 2).toString());
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);
    const supabase = createClient();
    const { error } = await supabase.from("action_plans").insert({
      organization_id: organizationId,
      nom,
      description: description || null,
      annee_debut: Number(anneeDebut),
      annee_fin: Number(anneeFin),
      statut: "actif",
    });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    onOuvertChange(false);
    router.refresh();
  }

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        + Nouveau plan
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={creer} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nouveau plan d&apos;actions</DialogTitle>
          </DialogHeader>
          {erreur && (
            <Alert variant="destructive">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="plan-nom">Nom</Label>
            <Input
              id="plan-nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder={`Plan ${anneeDebut}-${anneeFin}`}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plan-annee-debut">Année de début</Label>
              <Input
                id="plan-annee-debut"
                type="number"
                value={anneeDebut}
                onChange={(e) => setAnneeDebut(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-annee-fin">Année de fin</Label>
              <Input
                id="plan-annee-fin"
                type="number"
                value={anneeFin}
                onChange={(e) => setAnneeFin(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={enCours}>
              {enCours ? "Création…" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CatalogueDialog({
  catalogue,
  ouvert,
  onOuvertChange,
  onAjouter,
}: {
  catalogue: CatalogueItem[];
  ouvert: boolean;
  onOuvertChange: (v: boolean) => void;
  onAjouter: (item: CatalogueItem, echeance: string) => void;
}) {
  const [echeances, setEcheances] = useState<Record<string, string>>({});
  const categories = [...new Set(catalogue.map((c) => c.categorie))];

  return (
    <Dialog open={ouvert} onOpenChange={onOuvertChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter une action du catalogue</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {categories.map((cat) => (
            <div key={cat} className="space-y-2">
              <h3 className="text-sm font-semibold">
                {LABEL_CATEGORIE[cat] ?? cat}
              </h3>
              {catalogue
                .filter((c) => c.categorie === cat)
                .map((item) => (
                  <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.titre}</p>
                      {item.description && (
                        <p className="text-muted-foreground text-xs">{item.description}</p>
                      )}
                    </div>
                    <Input
                      type="date"
                      className="w-36"
                      value={echeances[item.id] ?? ""}
                      onChange={(e) =>
                        setEcheances((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onAjouter(item, echeances[item.id] ?? "")}
                    >
                      Ajouter
                    </Button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
