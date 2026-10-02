import { describe, expect, it } from "vitest";
import { validerReserve, vueAutonomie, type SaisieReserve } from "./reserves";
import { REGLAGES_AUTONOMIE_DEFAUT, analyserAutonomie } from "@/lib/moteur-gardien/autonomie";
import { HEURE_MS } from "@/lib/moteur-gardien/temps";

const texte = (s: string) => s.replace(/[  ]/g, " ");

const saisie = (s: Partial<SaisieReserve> = {}): SaisieReserve => ({
  label: "Citerne du toit",
  kind: "citerne",
  capacite: "10",
  forme: "verticale",
  hauteurPleine: "2,5",
  hauteurPrise: "0,1",
  montage: "distance",
  hauteurCapteur: "2,8",
  seuilBas: "",
  deviceId: "",
  ...s,
});

describe("saisie d'une réserve", () => {
  it("accepte les décimales à la française", () => {
    expect(validerReserve(saisie())).toEqual({
      ok: true,
      champs: {
        label: "Citerne du toit",
        kind: "citerne",
        capacity_m3: 10,
        shape: "verticale",
        full_height_m: 2.5,
        outlet_height_m: 0.1,
        sensor_mounting: "distance",
        sensor_height_m: 2.8,
        low_threshold_pct: null,
        device_id: null,
      },
    });
  });

  it("capteur immergé : pas de hauteur de capteur", () => {
    const r = validerReserve(saisie({ montage: "hauteur", hauteurCapteur: "", seuilBas: "25" }));
    expect(r.ok && r.champs.sensor_height_m).toBeNull();
    expect(r.ok && r.champs.low_threshold_pct).toBe(25);
  });

  it.each([
    [{ label: " " }, "Donnez un nom"],
    [{ capacite: "0" }, "volume de la réserve pleine"],
    [{ capacite: "dix" }, "volume de la réserve pleine"],
    [{ forme: "cylindre_horizontal", hauteurPleine: "" }, "diamètre intérieur"],
    [{ hauteurPrise: "3" }, "prise d'eau doit être plus basse"],
    [{ hauteurCapteur: "2" }, "hauteur du capteur au-dessus du fond"],
    [{ seuilBas: "120" }, "entre 0 et 100"],
    [{ deviceId: "abc" }, "Capteur introuvable"],
  ])("refuse %o", (champ, message) => {
    const r = validerReserve(saisie(champ as Partial<SaisieReserve>));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain(message);
  });
});

describe("carte d'autonomie d'un site", () => {
  const H = Date.UTC(2026, 9, 2, 10);
  const maintenant = H + 10 * 60_000;
  const reserve = {
    id: "r1",
    nom: "Citerne",
    capaciteM3: 30,
    hauteurPleineM: 3,
    hauteurPriseM: 0,
    forme: "verticale" as const,
    montage: "hauteur" as const,
    hauteurCapteurM: null,
    seuilBasPct: null,
  };
  // Coupure depuis 18 h, 1 m³/h : 12 m³ à H.
  const mesures: { tsMs: number; mesureM: number }[] = [];
  const arrivee: { tsMs: number; volumeM3: number }[] = [];
  for (let k = 8 * 24; k >= 0; k--) {
    const t = H - k * HEURE_MS;
    mesures.push({ tsMs: t, mesureM: (k > 18 ? 30 : 12 + k) / 10 });
    if (k > 0) arrivee.push({ tsMs: t + HEURE_MS, volumeM3: k > 18 ? 1 : 0 });
  }

  it("coupure : titre, compte à rebours et niveau bas à l'heure de Kinshasa", () => {
    const etat = analyserAutonomie({
      fuseau: "Africa/Kinshasa",
      maintenantMs: maintenant,
      reglages: REGLAGES_AUTONOMIE_DEFAUT,
      reserves: [{ reserve, mesures }],
      arrivees: [arrivee],
      coupureEnCours: null,
    });
    const v = vueAutonomie({
      etat,
      fuseau: "Africa/Kinshasa",
      maintenantMs: maintenant,
      coupureDebutMs: etat.nouvelleCoupure?.debutMs ?? null,
      compteurArrivee: true,
    });
    expect(v.arrivee).toEqual({ titre: "Réseau public coupé", ton: "danger", detail: "Plus d'eau du réseau depuis hier à 17:00." });
    expect(v.chiffre).toBe("12 h");
    expect(v.libelleChiffre).toBe("d'autonomie au rythme de consommation réel");
    expect(v.tonChiffre).toBe("attention");
    expect(texte(v.lignes.join(" "))).toBe(
      "Niveau bas prévu à 17:00, heure du site. Réserves : 40 % (12 m³ utiles sur 30 m³). Consommation réelle : 1 m³/h en moyenne sur 24 h.",
    );
  });

  it("sans compteur d'arrivée : invitation à le désigner", () => {
    const etat = analyserAutonomie({
      fuseau: "Africa/Kinshasa",
      maintenantMs: maintenant,
      reglages: REGLAGES_AUTONOMIE_DEFAUT,
      reserves: [{ reserve, mesures }],
      arrivees: null,
      coupureEnCours: null,
    });
    const v = vueAutonomie({ etat, fuseau: "Africa/Kinshasa", maintenantMs: maintenant, coupureDebutMs: null, compteurArrivee: false });
    expect(v.arrivee.titre).toBe("Arrivée du réseau non suivie");
    expect(v.arrivee.detail).toContain("Désignez le compteur d'arrivée");
    expect(v.libelleChiffre).toBe("d'autonomie si le réseau coupait maintenant");
    expect(texte(v.lignes.at(-1) as string)).toContain("(estimée d'après la baisse du niveau)");
  });
});
