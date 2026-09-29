import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { HEURE_MS, instantLocal, partiesLocales } from "@/lib/moteur-gardien/temps";

/**
 * Alertes, rapports et moments de vente de bout en bout (phase G5), contre
 * les fonctions « gardien-moteur » et « gardien-envois » déployées sur le
 * projet de développement, en mode « journal » (rien ne part réellement).
 * L'heure est imposée (appel service_role). Organisation, sites, relevés et
 * comptes jetables, supprimés à la fin.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(supabaseUrl, serviceKey);
const suffixe = crypto.randomUUID().slice(0, 8);
const password = `Test-${crypto.randomUUID()}!`;
const FUSEAU = "Europe/Paris";
const TEL_TECH = "+33612345678";
const TEL_DIRECTEUR = "+33698765432";

let orgId: string;
let site1: string;
let site2: string;
let meter1: string;
let device1: string;
let source: string;
let pilote1: string;
let pilote2: string;
const comptes: Record<string, { id: string; email: string; client: SupabaseClient }> = {};

const DEBUT_FUITE = instantLocal("2026-09-20", 22, FUSEAU);
const FIN_FUITE = instantLocal("2026-09-22", 18, FUSEAU);
const debit = (instant: number) => {
  const { heure } = partiesLocales(instant, FUSEAU);
  return (heure < 6 ? 3 : 40) + (instant >= DEBUT_FUITE && instant < FIN_FUITE ? 25 : 0);
};
const iso = (ms: number) => new Date(ms).toISOString();
const DETECTION = instantLocal("2026-09-22", 6, FUSEAU) + 10 * 60_000;

async function fonction(nom: string, corps: Record<string, unknown>) {
  const r = await fetch(`${supabaseUrl}/functions/v1/${nom}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const bilan = (await r.json()) as Record<string, unknown>;
  expect(bilan.erreurs, JSON.stringify(bilan)).toEqual([]);
  return bilan;
}
const moteur = (maintenant: number, jours = 2) =>
  Promise.all([site1, site2].map((s) => fonction("gardien-moteur", { site_id: s, maintenant: iso(maintenant), jours })));
const envois = (maintenant: number, sections: string[]) =>
  fonction("gardien-envois", { organization_id: orgId, maintenant: iso(maintenant), sections });

async function journal(objet: string, objetId: string) {
  const { data, error } = await admin
    .from("envois")
    .select("etape, canal, destinataire, corps, sujet, mode, statut")
    .eq("objet", objet)
    .eq("objet_id", objetId)
    .order("id");
  if (error) throw error;
  return data;
}

async function laFuite() {
  const { data } = await admin.from("leak_events").select("*").eq("site_id", site1).single();
  return data!;
}

async function rapport(site: string, kind: string) {
  const { data } = await admin.from("site_reports").select("*").eq("site_id", site).eq("kind", kind).maybeSingle();
  return data;
}

beforeAll(async () => {
  const { data: org, error } = await admin
    .from("organizations")
    .insert({ nom: `Envois test ${suffixe}`, kind: "sites", status: "essai" })
    .select("id")
    .single();
  if (error) throw error;
  orgId = org.id;
  const sites = await admin
    .from("sites")
    .insert([
      { organization_id: orgId, name: "Hôtel Alpha", type: "hotel", water_price_per_m3: 4.5 },
      { organization_id: orgId, name: "Hôtel Bêta", type: "hotel", water_price_per_m3: 4.5 },
    ])
    .select("id, name");
  if (sites.error) throw sites.error;
  site1 = sites.data.find((s) => s.name === "Hôtel Alpha")!.id;
  site2 = sites.data.find((s) => s.name === "Hôtel Bêta")!.id;

  const { data: src } = await admin
    .from("sources")
    .insert({ organization_id: orgId, type: "saisie_manuelle", nom: "Relevés de test" })
    .select("id")
    .single();
  source = src!.id;
  const compteurs = await admin
    .from("meters")
    .insert(
      [site1, site2].map((s, i) => ({
        organization_id: orgId,
        site_id: s,
        type: "point_comptage",
        numero_serie: `E-${suffixe}-${i}`,
        nom: "Général",
        zone: i === 0 ? "Cuisine" : "Général",
        transmission: "import",
        installed_at: "2026-08-31T22:00:00Z",
      })),
    )
    .select("id, site_id");
  if (compteurs.error) throw compteurs.error;
  meter1 = compteurs.data.find((m) => m.site_id === site1)!.id;

  const releves = [];
  const fin = instantLocal("2026-09-25", 7, FUSEAU);
  for (let h = instantLocal("2026-09-01", 0, FUSEAU); h < fin; h += HEURE_MS) {
    releves.push({
      organization_id: orgId,
      meter_id: meter1,
      source_id: source,
      ts: iso(h + HEURE_MS),
      volume_m3: debit(h) / 1000,
    });
  }
  const r = await admin.from("readings").insert(releves);
  if (r.error) throw r.error;

  const pilotes = await admin
    .from("pilots")
    .insert([
      {
        organization_id: orgId,
        site_id: site1,
        started_at: "2026-09-01T08:00:00Z",
        ends_at: "2026-10-01T08:00:00Z",
        auto_convert_consent: true,
        consent_at: "2026-09-01T08:00:00Z",
        consent_by_name: "Claire Martin",
        setup_refund_if_nothing_found: false,
      },
      {
        organization_id: orgId,
        site_id: site2,
        started_at: "2026-09-01T08:00:00Z",
        ends_at: "2026-10-01T08:00:00Z",
        auto_convert_consent: false,
        consent_at: null,
        consent_by_name: null,
        setup_refund_if_nothing_found: true,
      },
    ])
    .select("id, site_id");
  if (pilotes.error) throw pilotes.error;
  pilote1 = pilotes.data.find((p) => p.site_id === site1)!.id;
  pilote2 = pilotes.data.find((p) => p.site_id === site2)!.id;

  for (const [profil, role, portee] of [
    ["admin", "admin_client", "organisation"],
    ["tech", "technicien", "organisation"],
    ["directeur", "directeur_site", "site"],
  ] as const) {
    const email = `envois-${profil}-${suffixe}@example.com`;
    const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    const adhesion = await admin.from("memberships").insert({
      user_id: u.user!.id,
      organization_id: orgId,
      role,
      scope_type: portee,
      site_id: portee === "site" ? site1 : null,
    });
    if (adhesion.error) throw adhesion.error;
    const anon = createClient(supabaseUrl, anonKey);
    const { data: session } = await anon.auth.signInWithPassword({ email, password });
    comptes[profil] = {
      id: u.user!.id,
      email,
      client: createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
      }),
    };
  }
  await admin.from("memberships").update({ alert_phone: TEL_DIRECTEUR }).eq("user_id", comptes.directeur.id);

  const { data: appareil } = await admin
    .from("devices")
    .insert({
      organization_id: orgId,
      site_id: site1,
      meter_id: meter1,
      device_ref: Array.from(crypto.getRandomValues(new Uint8Array(8)), (o) => o.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
      model: "Milesight EM300-DI",
      kit: "C",
      transmission: "import",
      provisioning_status: "actif",
    })
    .select("id")
    .single();
  device1 = appareil!.id;
}, 180000);

afterAll(async () => {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  for (const c of Object.values(comptes)) await admin.auth.admin.deleteUser(c.id);
}, 60000);

describe("alertes, rapports et moments de vente de bout en bout", () => {
  it("le technicien renseigne son téléphone d'alerte", async () => {
    const { data, error } = await comptes.tech.client.rpc("mon_telephone_alerte", { p_phone: TEL_TECH });
    expect(error).toBeNull();
    expect(data).toBe(1);
    const refus = await comptes.tech.client.rpc("mon_telephone_alerte", { p_phone: "06 12" });
    expect(refus.error?.message).toContain("format international");
  });

  it("fuite détectée : e-mail et SMS au technicien, avec le coût en cours", async () => {
    await moteur(DETECTION, 22);
    const fuite = await laFuite();
    expect(fuite.type).toBe("fuite_nuit");
    await envois(DETECTION + 5 * 60_000, ["fuites"]);
    const lignes = await journal("fuite", fuite.id);
    expect(lignes.map((l) => [l.etape, l.canal, l.destinataire])).toEqual([
      ["initial", "email", comptes.tech.email],
      ["initial", "sms", TEL_TECH],
    ]);
    expect(lignes.every((l) => l.mode === "journal" && l.statut === "journalise")).toBe(true);
    const sms = lignes[1].corps.replace(/[  ]/g, " ");
    expect(sms).toContain("fuite de nuit à Hôtel Alpha, Cuisine, 25 L/h depuis 02:00");
    expect(sms).toContain("2,70 € par jour, 81,00 € par mois si rien n'est fait");
    expect(lignes[0].sujet).toBe("Fuite de nuit détectée : Hôtel Alpha, Cuisine");
  });

  it("sans prise en charge : appel après 2 h, directeur après 12 h, jamais deux fois", async () => {
    const fuite = await laFuite();
    await envois(DETECTION + 2 * HEURE_MS + 5 * 60_000, ["fuites"]);
    await envois(DETECTION + 12 * HEURE_MS + 5 * 60_000, ["fuites"]);
    await envois(DETECTION + 12 * HEURE_MS + 20 * 60_000, ["fuites"]);
    const lignes = await journal("fuite", fuite.id);
    expect(lignes.map((l) => [l.etape, l.canal, l.destinataire])).toEqual([
      ["initial", "email", comptes.tech.email],
      ["initial", "sms", TEL_TECH],
      ["appel", "appel", TEL_TECH],
      ["directeur", "email", comptes.directeur.email],
      ["directeur", "sms", TEL_DIRECTEUR],
    ]);
    expect(lignes[2].corps).toContain("Personne ne l'a encore prise en charge");
  });

  it("« Je m'en occupe » arrête les relances", async () => {
    const fuite = await laFuite();
    const { error } = await comptes.tech.client.rpc("fuite_prendre_en_charge", { p_leak_id: fuite.id });
    expect(error).toBeNull();
    await envois(DETECTION + 14 * HEURE_MS, ["fuites"]);
    expect(await journal("fuite", fuite.id)).toHaveLength(5);
  });

  it("rapport de première nuit le lendemain de la pose à 8 h, ouverture suivie", async () => {
    await envois(Date.parse("2026-09-02T07:00:00Z"), ["rapports"]);
    const r = await rapport(site1, "premiere_nuit");
    expect(r).toMatchObject({ period: "2026-09-02" });
    expect(r!.content).toMatchObject({ debitMinLph: 3, rienASignaler: true });
    expect(r!.content.courbe).toHaveLength(8);
    expect(r!.sent_at).not.toBeNull();
    const lignes = await journal("rapport", r!.id);
    expect(lignes.map((l) => l.destinataire).sort()).toEqual([comptes.admin.email, comptes.directeur.email].sort());
    expect(lignes[0].sujet).toBe("Première nuit sous surveillance — Hôtel Alpha");

    const { error } = await comptes.directeur.client.rpc("marquer_rapport_ouvert", { p_report_id: r!.id });
    expect(error).toBeNull();
    expect((await rapport(site1, "premiere_nuit"))!.opened_at).not.toBeNull();
  });

  it("rapport de première semaine à J+7", async () => {
    await envois(Date.parse("2026-09-08T07:00:00Z"), ["rapports"]);
    const r = await rapport(site1, "premiere_semaine");
    expect(r!.content).toMatchObject({ debut: "2026-09-01", fin: "2026-09-07", volumeTotalM3: 5.166 });
    expect(r!.content.phrase.replace(/[  ]/g, " ")).toBe(
      "Première semaine : rien à signaler. 5,17 m³ consommés en 7 jours.",
    );
  });

  it("réparation automatique, puis rapport mensuel et synthèse du groupe le 1er", async () => {
    await moteur(instantLocal("2026-09-24", 6, FUSEAU) + 10 * 60_000);
    expect(await laFuite()).toMatchObject({ status: "reparee" });
    await envois(Date.parse("2026-10-01T07:00:00Z"), ["rapports"]);
    const r = await rapport(site1, "mensuel");
    expect(r).toMatchObject({ period: "2026-09-01" });
    expect(r!.content.economiesCumulees).toMatchObject({ m3: 18, montant: 81 });
    expect(r!.content.fuites).toHaveLength(1);
    expect(r!.content.phraseSansFuite).toBeNull();
    expect(await rapport(site2, "mensuel")).not.toBeNull();
    const groupe = await journal("groupe", orgId);
    expect(groupe.map((l) => [l.etape, l.destinataire])).toEqual([["mensuel:2026-09", comptes.admin.email]]);
    expect(groupe[0].corps).toContain("Hôtel Alpha");
  });

  it("fin de pilote à J+25 : résumé et page preuve lisible sans connexion", async () => {
    await envois(Date.parse("2026-09-26T09:00:00Z"), ["pilotes"]);
    const r = await rapport(site1, "fin_pilote");
    expect(r!.content.titre).toBe("Ce que 30 jours de surveillance ont trouvé");
    expect(r!.content.anomalies).toBe(1);
    const token = r!.content.pagePreuve.token as string;
    const anonyme = createClient(supabaseUrl, anonKey);
    const { data: page, error } = await anonyme.rpc("page_preuve_publique", { p_token: token });
    expect(error).toBeNull();
    expect(page.content.economies).toMatchObject({ montant: 81 });
    expect(page.content.phrase.replace(/[  ]/g, " ")).toContain("81 € évités en");
    expect(JSON.stringify(page)).not.toContain("@");
    const lignes = await journal("rapport", r!.id);
    expect(lignes.map((l) => l.destinataire)).toContain(comptes.directeur.email);
  });

  it("J+30 : conversion seulement avec consentement écrit, sinon tâches pour SmartMeteria", async () => {
    await envois(Date.parse("2026-10-01T09:00:00Z"), ["pilotes"]);
    const { data: p1 } = await admin.from("pilots").select("status, converted_at").eq("id", pilote1).single();
    expect(p1).toMatchObject({ status: "converti" });
    const { data: org } = await admin.from("organizations").select("status").eq("id", orgId).single();
    expect(org!.status).toBe("actif");
    const confirmation = await journal("pilote", pilote1);
    expect(confirmation[0].corps).toContain("Claire Martin");

    const { data: p2 } = await admin.from("pilots").select("status").eq("id", pilote2).single();
    expect(p2!.status).toBe("en_cours");
    const { data: taches } = await admin.from("admin_tasks").select("kind").eq("pilot_id", pilote2).order("kind");
    expect(taches!.map((t) => t.kind)).toEqual(["appel_conversion", "remboursement_retrait"]);
  });

  it("première donnée reçue après une pose : message au technicien", async () => {
    const { data: session } = await admin
      .from("pose_sessions")
      .insert({
        organization_id: orgId,
        site_id: site1,
        device_id: device1,
        meter_id: meter1,
        started_by: comptes.tech.id,
        started_at: iso(Date.now() - HEURE_MS),
        zone: "Cuisine",
      })
      .select("id")
      .single();
    await admin.from("readings").insert({
      organization_id: orgId,
      meter_id: meter1,
      source_id: source,
      ts: iso(Date.now() - 60_000),
      volume_m3: 0.01,
    });
    await envois(Date.now() + 60_000, ["poses"]);
    const lignes = await journal("pose", session!.id);
    expect(lignes.map((l) => l.canal)).toEqual(["email", "sms"]);
    expect(lignes[0].sujet).toBe("Première donnée reçue : Cuisine — Hôtel Alpha");
  });

  it("journal des envois : lisible par l'administrateur, pas par le technicien, jamais modifiable", async () => {
    const parAdmin = await comptes.admin.client.from("envois").select("id").eq("organization_id", orgId);
    expect(parAdmin.data!.length).toBeGreaterThan(5);
    const parTech = await comptes.tech.client.from("envois").select("id").eq("organization_id", orgId);
    expect(parTech.data).toEqual([]);
    const { error } = await admin.from("envois").update({ statut: "echec" }).eq("organization_id", orgId);
    expect(error?.message).toContain("ajout seul");
  });
});
