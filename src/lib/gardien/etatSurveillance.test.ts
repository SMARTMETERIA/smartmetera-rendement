import { describe, expect, it } from "vitest";
import { CLASSES_TON, etatSurveillance } from "./etatSurveillance";

const base = { fuites: 0, pointsPoses: 4, capteursMuets: 0, temperaturesBasses: 0, equipe: true };

describe("état de surveillance affiché", () => {
  it("sous surveillance seulement quand des capteurs posés transmettent", () => {
    expect(etatSurveillance(base)).toEqual({
      titre: "Sous surveillance",
      ton: "succes",
      lignes: ["Votre eau est surveillée jour et nuit : vous êtes prévenu dès qu'une fuite apparaît."],
    });
  });

  it("aucun capteur posé : jamais « sous surveillance »", () => {
    const e = etatSurveillance({ ...base, pointsPoses: 0 });
    expect(e.titre).toBe("Aucun capteur posé");
    expect(e.lignes).toEqual(["La surveillance commence dès la pose du premier capteur."]);
  });

  it("tous les capteurs muets : surveillance interrompue", () => {
    const e = etatSurveillance({ ...base, capteursMuets: 4 });
    expect(e.titre).toBe("Surveillance interrompue");
    expect(e.ton).toBe("attention");
    expect(e.lignes[0]).toContain("Aucun capteur ne transmet plus");
  });

  it("une partie muette : surveillance partielle, au pluriel juste", () => {
    expect(etatSurveillance({ ...base, capteursMuets: 1 }).lignes[0]).toMatch(/^1 capteur ne transmet plus :/);
    const e = etatSurveillance({ ...base, capteursMuets: 2 });
    expect(e.titre).toBe("Surveillance partielle");
    expect(e.lignes[0]).toMatch(/^2 capteurs ne transmettent plus :/);
  });

  it("un directeur de site reçoit un message général sur les capteurs muets", () => {
    const e = etatSurveillance({ ...base, capteursMuets: 4, equipe: false });
    expect(e.lignes).toEqual(["Certaines données n'arrivent plus : une vérification des capteurs est en cours."]);
  });

  it("eau chaude sous le seuil : signalée sans masquer la surveillance", () => {
    const e = etatSurveillance({ ...base, temperaturesBasses: 1 });
    expect(e).toEqual({
      titre: "Sous surveillance",
      ton: "attention",
      lignes: ["Eau chaude sous le seuil sur 1 point : voir « Alertes »."],
    });
  });

  it("une fuite prime sur le reste, les autres signaux restent affichés", () => {
    const e = etatSurveillance({ ...base, fuites: 2, capteursMuets: 1, temperaturesBasses: 2 });
    expect(e.titre).toBe("2 fuites en cours");
    expect(e.ton).toBe("danger");
    expect(e.lignes).toHaveLength(2);
    expect(etatSurveillance({ ...base, fuites: 1 }).titre).toBe("1 fuite en cours");
  });

  it("couleurs par variables du thème, jamais l'ambre clair en texte", () => {
    expect(CLASSES_TON.attention).toBe("text-attention-foreground");
    expect(Object.values(CLASSES_TON).every((c) => /^text-[a-z-]+$/.test(c))).toBe(true);
  });
});
