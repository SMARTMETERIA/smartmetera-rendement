"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";
import { validerPose } from "@/app/(espace)/pose/actions";
import { POIDS_IMPULSION_COURANTS, ZONES_COURANTES } from "@/lib/gardien/pose";

export interface AppareilPose {
  id: string;
  reference: string;
  libelleModele: string;
  nature: "eau" | "temperature";
  voies: (string | null)[];
  consigne: string;
  /** Pose existante (site et zone), si le capteur est déjà posé. */
  dejaPose: string | null;
}

export interface SitePose {
  id: string;
  name: string;
}

type Etape =
  "site" | "voie" | "type" | "zone" | "photo" | "index" | "poids" | "recap";

const TYPES_POINT = [
  {
    valeur: "sortie_production",
    libelle: "Départ de la production d'eau chaude",
  },
  { valeur: "retour_boucle", libelle: "Retour de boucle" },
  { valeur: "point_eloigne", libelle: "Point le plus éloigné" },
] as const;

const TAILLE_PHOTO = 1600;

/** Réduit la photo (côté téléphone) avant l'envoi : ≈ 300 Ko au lieu de 4 Mo. */
async function reduirePhoto(fichier: File): Promise<Blob> {
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(
      1,
      TAILLE_PHOTO / Math.max(image.width, image.height),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas
      .getContext("2d")
      ?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) =>
      canvas.toBlob(ok, "image/jpeg", 0.8),
    );
    return blob ?? fichier;
  } catch {
    return fichier;
  }
}

function lireNombre(saisie: string): number | null {
  const n = Number(saisie.replace(/\s/g, "").replace(",", "."));
  return saisie.trim() !== "" && Number.isFinite(n) ? n : null;
}

function GrosChoix({
  choisi,
  onClick,
  children,
}: {
  choisi?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={choisi}
      className="border-border hover:bg-muted focus-visible:ring-ring/50 aria-pressed:border-primary aria-pressed:bg-primary/5 w-full rounded-xl border-2 px-4 py-4 text-left text-lg font-medium transition-colors outline-none focus-visible:ring-3"
    >
      {children}
    </button>
  );
}

export function AssistantPose({
  appareil,
  sites,
  organizationId,
}: {
  appareil: AppareilPose;
  sites: SitePose[];
  organizationId: string;
}) {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string | null>(
    sites.length === 1 ? sites[0].id : null,
  );
  const [canal, setCanal] = useState<string | null>(
    appareil.voies.length === 1 ? appareil.voies[0] : null,
  );
  const [typePoint, setTypePoint] = useState<string | null>(null);
  const [zone, setZone] = useState("");
  const [zoneLibre, setZoneLibre] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [apercu, setApercu] = useState<string | null>(null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [index, setIndex] = useState("");
  const [poids, setPoids] = useState<number | null>(null);
  const [poidsLibre, setPoidsLibre] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const etapes = useMemo<Etape[]>(() => {
    const liste: Etape[] = [];
    if (sites.length > 1) liste.push("site");
    if (appareil.nature === "eau") {
      if (appareil.voies.length > 1) liste.push("voie");
      liste.push("zone", "photo", "index", "poids");
    } else {
      liste.push("type", "zone");
    }
    liste.push("recap");
    return liste;
  }, [sites.length, appareil.nature, appareil.voies.length]);
  const [rang, setRang] = useState(0);
  const etape = etapes[rang];
  const site = sites.find((s) => s.id === siteId);

  function suivant() {
    setErreur(null);
    setRang((r) => Math.min(r + 1, etapes.length - 1));
  }

  function precedent() {
    setErreur(null);
    setRang((r) => Math.max(r - 1, 0));
  }

  async function envoyerPhoto(fichier: File | undefined) {
    if (!fichier || !siteId) return;
    setEnvoiPhoto(true);
    setErreur(null);
    const blob = await reduirePhoto(fichier);
    const chemin = `${organizationId}/${siteId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient()
      .storage.from("poses")
      .upload(chemin, blob, { contentType: "image/jpeg" });
    setEnvoiPhoto(false);
    if (error) {
      setErreur(
        "La photo n'a pas pu être envoyée. Vérifiez le réseau et réessayez.",
      );
      return;
    }
    setPhotoPath(chemin);
    setApercu(URL.createObjectURL(blob));
  }

  const poidsChoisi = poids ?? lireNombre(poidsLibre);
  const indexChoisi = lireNombre(index);

  async function valider() {
    if (!siteId) return;
    setEnCours(true);
    setErreur(null);
    const resultat = await validerPose({
      deviceId: appareil.id,
      siteId,
      canal,
      zone: zone.trim(),
      photoPath,
      indexM3: appareil.nature === "eau" ? indexChoisi : null,
      poidsL: appareil.nature === "eau" ? poidsChoisi : null,
      typePoint: appareil.nature === "temperature" ? typePoint : null,
    });
    if ("erreur" in resultat) {
      setEnCours(false);
      setErreur(resultat.erreur);
      return;
    }
    router.push(`/pose/suivi/${resultat.sessionId}`);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          Étape {rang + 1} sur {etapes.length} · {appareil.libelleModele} · réf.{" "}
          {appareil.reference}
        </p>
        {rang === 0 && (
          <p className="bg-muted rounded-lg p-3 text-sm">{appareil.consigne}</p>
        )}
        {rang === 0 && appareil.dejaPose && (
          <p className="bg-attention/20 rounded-lg p-3 text-sm">
            Ce capteur est déjà posé ({appareil.dejaPose}). Continuer le repose
            à l&apos;emplacement choisi.
          </p>
        )}
      </div>

      {erreur && (
        <Alert variant="destructive">
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {etape === "site" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            Sur quel site posez-vous ce capteur ?
          </h1>
          {sites.map((s) => (
            <GrosChoix
              key={s.id}
              choisi={siteId === s.id}
              onClick={() => {
                setSiteId(s.id);
                suivant();
              }}
            >
              {s.name}
            </GrosChoix>
          ))}
        </section>
      )}

      {etape === "voie" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            Sur quelle entrée avez-vous branché le compteur ?
          </h1>
          <p className="text-muted-foreground">
            Regardez l&apos;étiquette du bornier : A ou B.
          </p>
          {appareil.voies.map((v) => (
            <GrosChoix
              key={v ?? "unique"}
              choisi={canal === v}
              onClick={() => {
                setCanal(v);
                suivant();
              }}
            >
              Entrée {v}
            </GrosChoix>
          ))}
        </section>
      )}

      {etape === "type" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">Où est fixée la sonde ?</h1>
          {TYPES_POINT.map((t) => (
            <GrosChoix
              key={t.valeur}
              choisi={typePoint === t.valeur}
              onClick={() => {
                setTypePoint(t.valeur);
                if (!zone) setZone(t.libelle);
                suivant();
              }}
            >
              {t.libelle}
            </GrosChoix>
          ))}
        </section>
      )}

      {etape === "zone" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            {appareil.nature === "eau"
              ? "Quelle zone ce compteur alimente-t-il ?"
              : "Comment appeler ce point ?"}
          </h1>
          {appareil.nature === "eau" &&
            !zoneLibre &&
            ZONES_COURANTES.map((z) => (
              <GrosChoix
                key={z}
                choisi={zone === z}
                onClick={() => {
                  setZone(z);
                  suivant();
                }}
              >
                {z}
              </GrosChoix>
            ))}
          {appareil.nature === "eau" && !zoneLibre && (
            <GrosChoix onClick={() => setZoneLibre(true)}>
              Autre zone…
            </GrosChoix>
          )}
          {(zoneLibre || appareil.nature === "temperature") && (
            <div className="space-y-3">
              <Label htmlFor="zone">Nom de la zone</Label>
              <Input
                id="zone"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                className="h-14 text-lg"
                autoFocus
              />
              <Button
                className="h-14 w-full text-lg"
                disabled={zone.trim().length < 2}
                onClick={suivant}
              >
                Continuer
              </Button>
            </div>
          )}
        </section>
      )}

      {etape === "photo" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Photographiez le compteur</h1>
          <p className="text-muted-foreground">
            Cadrez l&apos;index (les chiffres) : la photo servira à vérifier le
            réglage dans quelques jours.
          </p>
          <label className="bg-primary text-primary-foreground focus-within:ring-ring/50 flex h-14 w-full cursor-pointer items-center justify-center rounded-lg text-lg font-medium focus-within:ring-3">
            {envoiPhoto
              ? "Envoi de la photo…"
              : photoPath
                ? "Reprendre la photo"
                : "Prendre la photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={envoiPhoto}
              onChange={(e) => envoyerPhoto(e.target.files?.[0])}
            />
          </label>
          {apercu && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={apercu}
              alt="Photo du compteur"
              className="w-full rounded-lg border"
            />
          )}
          <div className="flex gap-3">
            {!photoPath && (
              <Button variant="ghost" className="h-12 flex-1" onClick={suivant}>
                Passer
              </Button>
            )}
            {photoPath && (
              <Button className="h-14 flex-1 text-lg" onClick={suivant}>
                Continuer
              </Button>
            )}
          </div>
        </section>
      )}

      {etape === "index" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">
            Quel index affiche le compteur ?
          </h1>
          <p className="text-muted-foreground">
            En mètres cubes, chiffres noirs seulement (par exemple 1 234,5).
          </p>
          <Input
            inputMode="decimal"
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            className="h-16 text-3xl tabular-nums"
            aria-label="Index en mètres cubes"
            autoFocus
          />
          <Button
            className="h-14 w-full text-lg"
            disabled={indexChoisi === null || indexChoisi < 0}
            onClick={suivant}
          >
            Continuer
          </Button>
        </section>
      )}

      {etape === "poids" && (
        <section className="space-y-3">
          <h1 className="text-2xl font-semibold">
            Combien de litres par impulsion ?
          </h1>
          <p className="text-muted-foreground">
            Indiqué sur le compteur ou sur l&apos;émetteur d&apos;impulsions
            (par exemple « 1 imp = 10 L »).
          </p>
          {POIDS_IMPULSION_COURANTS.map((p) => (
            <GrosChoix
              key={p}
              choisi={poids === p}
              onClick={() => {
                setPoids(p);
                setPoidsLibre("");
                suivant();
              }}
            >
              {new Intl.NumberFormat("fr-FR").format(p)} litre{p > 1 ? "s" : ""}
            </GrosChoix>
          ))}
          <div className="space-y-2 pt-2">
            <Label htmlFor="poids-libre">Autre valeur (litres)</Label>
            <Input
              id="poids-libre"
              inputMode="decimal"
              value={poidsLibre}
              onChange={(e) => {
                setPoids(null);
                setPoidsLibre(e.target.value);
              }}
              className="h-14 text-lg"
            />
            {poidsLibre && (
              <Button
                className="h-14 w-full text-lg"
                disabled={poidsChoisi === null || poidsChoisi <= 0}
                onClick={suivant}
              >
                Continuer
              </Button>
            )}
          </div>
        </section>
      )}

      {etape === "recap" && (
        <section className="space-y-4">
          <h1 className="text-2xl font-semibold">Tout est juste ?</h1>
          <dl className="divide-border divide-y rounded-lg border text-base">
            {[
              ["Site", site?.name],
              ...(appareil.voies.length > 1 ? [["Entrée", canal]] : []),
              ["Zone", zone],
              ...(appareil.nature === "eau"
                ? [
                    ["Photo", photoPath ? "prise" : "non prise"],
                    [
                      "Index",
                      indexChoisi !== null
                        ? `${new Intl.NumberFormat("fr-FR").format(indexChoisi)} m³`
                        : "—",
                    ],
                    [
                      "Litres par impulsion",
                      poidsChoisi !== null
                        ? new Intl.NumberFormat("fr-FR").format(poidsChoisi)
                        : "—",
                    ],
                  ]
                : [
                    [
                      "Emplacement",
                      TYPES_POINT.find((t) => t.valeur === typePoint)?.libelle,
                    ],
                  ]),
            ].map(([libelle, valeur]) => (
              <div
                key={libelle}
                className="flex justify-between gap-4 px-4 py-3"
              >
                <dt className="text-muted-foreground">{libelle}</dt>
                <dd className="text-right font-medium">{valeur ?? "—"}</dd>
              </div>
            ))}
          </dl>
          <Button
            className="h-14 w-full text-lg"
            disabled={enCours || !siteId}
            onClick={valider}
          >
            {enCours ? "Enregistrement…" : "Valider la pose"}
          </Button>
        </section>
      )}

      {rang > 0 && (
        <Button
          variant="ghost"
          className="h-12"
          onClick={precedent}
          disabled={enCours}
        >
          Retour
        </Button>
      )}
    </div>
  );
}
