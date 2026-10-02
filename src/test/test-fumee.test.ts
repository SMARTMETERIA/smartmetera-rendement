import { describe, expect, it } from "vitest";
import { regionVercel, tachesEnRetard, verifierEntetes } from "../../scripts/test-fumee.mjs";
import { entetesSecurite } from "@/lib/securite/entetes";

const H = 3_600_000;

describe("test de fumée", () => {
  it("accepte exactement les en-têtes posés par l'application en production", () => {
    const production = new Headers(
      entetesSecurite({ supabaseUrl: "https://x.supabase.co", developpement: false }).map((e): [string, string] => [e.key, e.value]),
    );
    expect(verifierEntetes(production, true)).toEqual([]);
  });

  it("repère une configuration de développement ou incomplète", () => {
    const dev = new Headers(
      entetesSecurite({ supabaseUrl: "https://x.supabase.co", developpement: true }).map((e): [string, string] => [e.key, e.value]),
    );
    dev.set("x-powered-by", "Next.js");
    const problemes = verifierEntetes(dev, true);
    expect(problemes).toContain("CSP de développement ('unsafe-eval') en ligne");
    expect(problemes).toContain("HSTS absent");
    expect(problemes).toContain("X-Powered-By présent");
    expect(verifierEntetes(new Headers(), false)).toHaveLength(5);
  });

  it("lit la région Vercel", () => {
    expect(regionVercel("cdg1::cdg1::abcd-123")).toEqual({ entree: "cdg1", fonction: "cdg1" });
    expect(regionVercel("cdg1::iad1::abcd-123")).toEqual({ entree: "cdg1", fonction: "iad1" });
    expect(regionVercel("fra1::abcd-123")).toEqual({ entree: "fra1", fonction: null });
    expect(regionVercel(null)).toBeNull();
  });

  it("signale les tâches planifiées en retard, jamais passées ou en échec", () => {
    const maintenant = Date.UTC(2026, 9, 1, 12);
    const etat = {
      fonctions: [
        { tache: "gardien-moteur", dernier_debut: new Date(maintenant - 0.5 * H).toISOString(), dernier_statut: "ok" },
        { tache: "gardien-envois", dernier_debut: new Date(maintenant - 2 * H).toISOString(), dernier_statut: "ok" },
      ],
      cron: [
        { nom: "purge-donnees-personnelles", active: true, dernier_statut: "failed" },
        { nom: "notifications-alertes", active: false, dernier_statut: "failed" },
      ],
    };
    expect(tachesEnRetard(etat, maintenant)).toEqual([
      "gardien-envois : en retard",
      "purge-donnees-personnelles : dernier passage pg_cron en échec",
    ]);
    expect(tachesEnRetard({ fonctions: [], cron: [] }, maintenant)).toEqual([
      "gardien-moteur : jamais passée",
      "gardien-envois : jamais passée",
    ]);
  });
});
