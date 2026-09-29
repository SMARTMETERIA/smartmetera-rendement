// Jeu de démonstration du Gardien de l'eau (plan, phase G9) :
//   node scripts/demo-reset.mjs   (ou npm run demo:reset)
//
// Réservé au développement : refuse de tourner si NODE_ENV=production ou
// si l'URL Supabase est celle de production (SUPABASE_URL_PRODUCTION).
// Efface puis recrée les organisations marquées settings.demo = true et
// les comptes demo-…@example.com :
// - « Hôtels Atlas Démo » : chaîne au Maroc (MAD, Casablanca, kit C),
//   3 hôtels de 4 points, 6 mois de relevés horaires, une fuite de chasse
//   d'eau détectée puis réparée, un capteur muet, une sonde d'eau chaude
//   qui passe sous le seuil ;
// - « Camping Partenaire Démo » : marque blanche (France, EUR), camping
//   avec arrosage de nuit déclaré (aucune fausse alerte) et une rupture,
//   camping fermé pour l'hiver avec une fuite détectée en mode fermeture ;
// - « Hôtel Bellecour Démo » : hôtel lyonnais en pilote à J+20 (kit A),
//   fuite ouverte avec son compteur de pertes, page preuve.
// Puis fait tourner le moteur et les envois (mode journal : rien ne part).
import { createRequire } from "node:module";
import path from "node:path";

const racine = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(racine, "package.json"));
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: path.join(racine, ".env.local"), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires (.env.local).");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" || (process.env.SUPABASE_URL_PRODUCTION && url === process.env.SUPABASE_URL_PRODUCTION)) {
  console.error("Refusé : le jeu de démonstration ne s'installe jamais sur la base de production.");
  process.exit(1);
}

const admin = createClient(url, cle, { auth: { persistSession: false } });
const H = 3_600_000;
const J = 24 * H;
const debut = Date.now();
const maintenant = Math.floor(Date.now() / H) * H + 10 * 60_000;
const motDePasse = process.env.DEMO_MOT_DE_PASSE || `Demo-${Math.random().toString(36).slice(2, 10)}!`;

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------
function etape(texte) {
  console.log(`[${((Date.now() - debut) / 1000).toFixed(0).padStart(3)} s] ${texte}`);
}

async function ok(promesse, quoi) {
  const { data, error } = await promesse;
  if (error) throw new Error(`${quoi} : ${error.message}`);
  return data;
}

/** Générateur pseudo-aléatoire déterministe (mêmes données à chaque reset). */
function hasard(graine) {
  let x = graine >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

const formateurs = new Map();
function heureLocale(ms, fuseau) {
  let f = formateurs.get(fuseau);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: fuseau, hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" });
    formateurs.set(fuseau, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { heure: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
}

/** Profil horaire d'un point (L/h) : nuit calme, pointes matin et soir. */
function profil(type, heure) {
  const table = {
    general: [6, 3, 2, 2, 3, 12, 45, 90, 110, 80, 60, 55, 60, 55, 45, 40, 45, 60, 85, 95, 80, 55, 30, 15],
    cuisine: [0, 0, 0, 0, 0, 5, 40, 70, 60, 30, 25, 50, 90, 80, 30, 15, 20, 40, 70, 90, 70, 30, 5, 0],
    chambres: [4, 2, 2, 2, 3, 8, 50, 110, 120, 70, 40, 30, 30, 30, 25, 25, 30, 40, 60, 90, 100, 80, 35, 10],
    piscine: [0, 0, 0, 0, 0, 0, 0, 0, 20, 40, 40, 40, 40, 40, 40, 40, 40, 40, 20, 0, 0, 0, 0, 0],
    sanitaires: [5, 3, 2, 2, 3, 10, 60, 120, 100, 60, 40, 40, 50, 40, 30, 30, 40, 60, 90, 110, 80, 40, 15, 8],
    arrosage: [300, 300, 300, 300, 300, 300, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300, 300],
  };
  return table[type][heure];
}

/** Relevés horaires d'un point entre deux instants (volume de l'heure écoulée). */
function releves({ organisation, compteur, source, fuseau, type, depuis, jusqua, graine, ajout = () => 0, remplace = () => null, facteur = 1 }) {
  const aleatoire = hasard(graine);
  const lignes = [];
  for (let h = Math.floor(depuis / H) * H; h + H <= jusqua; h += H) {
    const { heure } = heureLocale(h, fuseau);
    const base = profil(type, heure) * facteur;
    const bruit = base * (0.85 + aleatoire() * 0.3);
    const impose = remplace(h, heure);
    const litres = impose !== null ? Math.round(impose) : Math.max(0, Math.round(bruit + ajout(h, heure)));
    lignes.push({ organization_id: organisation, meter_id: compteur, source_id: source, ts: new Date(h + H).toISOString(), volume_m3: litres / 1000 });
  }
  return lignes;
}

async function inserer(table, lignes, quoi) {
  for (let i = 0; i < lignes.length; i += 1000) {
    await ok(admin.from(table).insert(lignes.slice(i, i + 1000)), quoi);
  }
}

async function fonction(nom, corps) {
  const r = await fetch(`${url}/functions/v1/${nom}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const bilan = await r.json().catch(() => ({}));
  if (!r.ok || (bilan.erreurs && bilan.erreurs.length)) throw new Error(`${nom} : ${JSON.stringify(bilan)}`);
  return bilan;
}

function devEui(prefixe, n) {
  return `${prefixe}${String(n).padStart(16 - prefixe.length, "0")}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// 1) Effacer l'ancienne démonstration
// ---------------------------------------------------------------------------
async function effacer() {
  const orgs = await ok(admin.from("organizations").select("id, nom").eq("settings->>demo", "true"), "organisations de démo");
  for (const o of orgs) await ok(admin.from("organizations").delete().eq("id", o.id), `suppression ${o.nom}`);
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const demo = (data?.users ?? []).filter((u) => /^demo-[a-z0-9-]+@example\.com$/.test(u.email ?? ""));
    for (const u of demo) await admin.auth.admin.deleteUser(u.id);
    if (!data || data.users.length < 1000) break;
  }
  etape(`ancienne démonstration effacée (${orgs.length} organisation(s))`);
}

async function compte(email, organisation, role, portee = "organisation", site = null, telephone = null) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true });
  if (error) throw new Error(`compte ${email} : ${error.message}`);
  await ok(
    admin.from("memberships").insert({
      user_id: data.user.id,
      organization_id: organisation,
      role,
      scope_type: portee,
      site_id: portee === "site" ? site : null,
      alert_phone: telephone,
    }),
    `adhésion ${email}`,
  );
  return email;
}

async function organisation(champs) {
  return ok(admin.from("organizations").insert({ ...champs, settings: { demo: true } }).select("id").single(), champs.nom);
}

// ---------------------------------------------------------------------------
// 2) Hôtels Atlas Démo (Maroc)
// ---------------------------------------------------------------------------
async function atlas(comptes) {
  const fuseau = "Africa/Casablanca";
  const org = await organisation({ nom: "Hôtels Atlas Démo", kind: "sites", status: "actif", country: "MA", withholding_tax_pct: 10, slug: "hotels-atlas-demo" });
  const source = await ok(admin.from("sources").insert({ organization_id: org.id, type: "saisie_manuelle", nom: "Démonstration" }).select("id").single(), "source Atlas");
  const hotels = [
    { name: "Atlas Marrakech Médina", city: "Marrakech", capacity: 80 },
    { name: "Atlas Agadir Plage", city: "Agadir", capacity: 120 },
    { name: "Atlas Casablanca Centre", city: "Casablanca", capacity: 60 },
  ];
  const debutDonnees = maintenant - 182 * J;
  const sites = [];
  let n = 1;
  for (const [i, h] of hotels.entries()) {
    const site = await ok(
      admin
        .from("sites")
        .insert({
          organization_id: org.id,
          name: h.name,
          type: "hotel",
          city: h.city,
          country: "MA",
          timezone: fuseau,
          currency: "MAD",
          water_price_per_m3: 9.5, // prix de démonstration (aucun prix par défaut au Maroc)
          activity_unit: "nuitee",
          capacity: h.capacity,
          occupancy_rate_default: 0.65,
        })
        .select("id")
        .single(),
      h.name,
    );
    sites.push(site.id);
    for (const [j, type] of ["general", "cuisine", "chambres", "piscine"].entries()) {
      const zone = { general: "Général", cuisine: "Cuisine", chambres: "Chambres", piscine: "Piscine" }[type];
      const muet = i === 2 && type === "piscine";
      const compteur = await ok(
        admin
          .from("meters")
          .insert({ organization_id: org.id, site_id: site.id, type: "point_comptage", numero_serie: `ATL-${i}${j}`, nom: zone, zone, transmission: "lorawan", pulse_weight_l: 10, installed_at: new Date(debutDonnees).toISOString() })
          .select("id")
          .single(),
        `point ${zone}`,
      );
      await ok(
        admin.from("devices").insert({
          organization_id: org.id,
          site_id: site.id,
          meter_id: compteur.id,
          source_id: source.id,
          device_ref: devEui("A7A5DE", n++),
          model: "Milesight EM300-DI",
          kit: "C",
          transmission: "lorawan",
          provisioning_status: "actif",
          battery_pct: muet ? 18 : 92 - j * 3,
          rssi: -88 - j * 4,
          snr: 8 - j,
          last_seen_at: new Date(muet ? maintenant - 2 * J : maintenant - 40 * 60_000).toISOString(),
        }),
        "appareil",
      );
      // Fuite de chasse d'eau : +25 L/h pendant 9 jours, il y a 4 semaines.
      const fuite = i === 1 && type === "chambres";
      const debutFuite = maintenant - 28 * J;
      const finFuite = maintenant - 19 * J;
      await inserer(
        "readings",
        releves({
          organisation: org.id,
          compteur: compteur.id,
          source: source.id,
          fuseau,
          type,
          depuis: debutDonnees,
          jusqua: muet ? maintenant - 2 * J : maintenant,
          graine: 1000 * i + j,
          facteur: h.capacity / 80,
          ajout: (t) => (fuite && t >= debutFuite && t < finFuite ? 25 : 0),
        }),
        "relevés Atlas",
      );
      if (fuite) {
        const f = await ok(
          admin
            .from("leak_events")
            .insert({
              organization_id: org.id,
              site_id: site.id,
              meter_id: compteur.id,
              type: "fuite_nuit",
              started_at: new Date(debutFuite).toISOString(),
              detected_at: new Date(debutFuite + 2 * J).toISOString(),
              excess_flow_lph: 25,
              currency: "MAD",
              status: "prise_en_compte",
              acknowledged_at: new Date(debutFuite + 2 * J + 3 * H).toISOString(),
              details: { explication: "Débit de nuit au-dessus du seuil 2 nuits de suite : chasse d'eau qui fuit (étage 2)." },
            })
            .select("id")
            .single(),
          "fuite Atlas",
        );
        await ok(admin.rpc("fuite_cloturer_reparee", { p_leak_id: f.id, p_source: "automatique", p_quand: new Date(finFuite + 2 * J).toISOString(), p_par: null }), "réparation Atlas");
      }
    }
    // Sonde d'eau chaude (retour de boucle) du premier hôtel.
    if (i === 0) {
      const sonde = await ok(
        admin
          .from("devices")
          .insert({ organization_id: org.id, site_id: site.id, device_ref: devEui("A7A5DF", 1), model: "Sonde de température", kit: "sonde", transmission: "lorawan", provisioning_status: "actif", battery_pct: 95, last_seen_at: new Date(maintenant - 30 * 60_000).toISOString() })
          .select("id")
          .single(),
        "sonde",
      );
      const point = await ok(
        admin.from("temperature_points").insert({ organization_id: org.id, site_id: site.id, label: "Retour de boucle", type: "retour_boucle", device_id: sonde.id }).select("id").single(),
        "point de température",
      );
      const aleatoire = hasard(77);
      const mesures = [];
      for (let t = debutDonnees; t < maintenant - 20 * 60_000; t += 2 * H) {
        const recent = t > maintenant - 3 * H;
        mesures.push({ organization_id: org.id, point_id: point.id, ts: new Date(t).toISOString(), value_c: recent ? 47.2 : Math.round((55 + aleatoire() * 3) * 10) / 10 });
      }
      await inserer("temperature_readings", mesures, "températures");
    }
    await activite(org.id, site.id, h.capacity, 0.65, 11 + i);
  }
  comptes.push(await compte("demo-atlas-admin@example.com", org.id, "admin_client"));
  comptes.push(await compte("demo-atlas-directeur@example.com", org.id, "directeur_site", "site", sites[0], "+212600000002"));
  comptes.push(await compte("demo-atlas-technicien@example.com", org.id, "technicien", "organisation", null, "+212600000001"));
  etape("Hôtels Atlas Démo : 3 hôtels, 12 points, 6 mois de relevés");
  return { org: org.id, sites };
}

/** Nuitées ou emplacements occupés des 6 derniers mois. */
async function activite(organisation, site, capacite, taux, graine) {
  const aleatoire = hasard(graine);
  const lignes = [];
  const d = new Date(maintenant);
  for (let i = 1; i <= 6; i++) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const jours = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
    lignes.push({ organization_id: organisation, site_id: site, date: m.toISOString().slice(0, 10), period: "mois", quantity: Math.round(capacite * jours * (taux + (aleatoire() - 0.5) * 0.2)) });
  }
  await inserer("activity_data", lignes, "activité");
}

// ---------------------------------------------------------------------------
// 3) Camping Partenaire Démo (marque blanche, France)
// ---------------------------------------------------------------------------
async function camping(comptes) {
  const fuseau = "Europe/Paris";
  const org = await organisation({ nom: "Camping Partenaire Démo", kind: "sites", status: "actif", country: "FR", partner_price_per_point: 7, slug: "camping-partenaire-demo" });
  await ok(
    admin.from("org_branding").insert({
      organization_id: org.id,
      display_name: "Aqua Camping Services",
      primary_color: "#2A7F62",
      accent_color: "#F2A900",
      sender_name: "Alertes Aqua Camping",
      reply_to_email: "support@aqua-camping.example.com",
      legal_footer: "Aqua Camping Services, société de démonstration.",
      show_powered_by: true,
    }),
    "marque",
  );
  const client = await ok(admin.from("clients").insert({ organization_id: org.id, name: "Groupe Les Pins (démo)" }).select("id").single(), "client");
  const source = await ok(admin.from("sources").insert({ organization_id: org.id, type: "saisie_manuelle", nom: "Démonstration" }).select("id").single(), "source camping");
  const debutDonnees = maintenant - 182 * J;
  const lesPins = await ok(
    admin
      .from("sites")
      .insert({ organization_id: org.id, client_id: client.id, name: "Camping Les Pins", type: "camping", city: "Agde", timezone: fuseau, currency: "EUR", activity_unit: "emplacement", capacity: 150, occupancy_rate_default: 0.55 })
      .select("id")
      .single(),
    "Les Pins",
  );
  const debutFermeture = new Date(maintenant - 9 * J).toISOString().slice(0, 10);
  const lac = await ok(
    admin
      .from("sites")
      .insert({
        organization_id: org.id,
        client_id: client.id,
        name: "Camping du Lac",
        type: "camping",
        city: "Annecy",
        timezone: fuseau,
        currency: "EUR",
        activity_unit: "emplacement",
        capacity: 90,
        occupancy_rate_default: 0.5,
        closed_periods: [{ start: debutFermeture, end: "2027-04-15", label: "Fermeture d'hiver" }],
      })
      .select("id")
      .single(),
    "Lac",
  );
  let n = 1;
  const points = [
    { site: lesPins.id, type: "general", zone: "Général" },
    { site: lesPins.id, type: "sanitaires", zone: "Sanitaires" },
    { site: lesPins.id, type: "arrosage", zone: "Arrosage" },
    { site: lac.id, type: "general", zone: "Général" },
    { site: lac.id, type: "sanitaires", zone: "Sanitaires" },
  ];
  for (const p of points) {
    const compteur = await ok(
      admin
        .from("meters")
        .insert({ organization_id: org.id, site_id: p.site, type: "point_comptage", numero_serie: `CMP-${n}`, nom: p.zone, zone: p.zone, transmission: "lorawan", pulse_weight_l: 10, installed_at: new Date(debutDonnees).toISOString() })
        .select("id")
        .single(),
      `point ${p.zone}`,
    );
    await ok(
      admin.from("devices").insert({ organization_id: org.id, site_id: p.site, meter_id: compteur.id, source_id: source.id, device_ref: devEui("CA7B1D", n++), model: "Milesight EM300-DI", kit: "C", transmission: "lorawan", provisioning_status: "actif", battery_pct: 88, rssi: -95, snr: 6, last_seen_at: new Date(maintenant - 35 * 60_000).toISOString() }),
      "appareil camping",
    );
    const fermeLe = Date.parse(`${debutFermeture}T00:00:00Z`);
    const fuiteFermeture = maintenant - 3 * J;
    const rupture = maintenant - 25 * J + 14 * H;
    await inserer(
      "readings",
      releves({
        organisation: org.id,
        compteur: compteur.id,
        source: source.id,
        fuseau,
        type: p.type,
        depuis: debutDonnees,
        jusqua: maintenant,
        graine: 5000 + n,
        facteur: p.site === lac.id ? 0.6 : 1,
        // Site fermé : plus rien ne coule, sauf la fuite du Général.
        remplace: (t) =>
          p.site === lac.id && t >= fermeLe ? (p.type === "general" && t >= fuiteFermeture ? 3 : 0) : null,
        ajout: (t) => (p.site === lesPins.id && p.type === "sanitaires" && t >= rupture && t < rupture + H ? 900 : 0),
      }),
      "relevés camping",
    );
    if (p.site === lesPins.id && p.type === "arrosage") {
      await ok(
        admin.from("quiet_windows").insert({ organization_id: org.id, site_id: p.site, meter_id: compteur.id, label: "Arrosage automatique", start_local: "22:00", end_local: "06:00" }),
        "plage d'arrosage",
      );
    }
    if (p.site === lesPins.id && p.type === "sanitaires") {
      const f = await ok(
        admin
          .from("leak_events")
          .insert({
            organization_id: org.id,
            site_id: p.site,
            meter_id: compteur.id,
            type: "rupture",
            started_at: new Date(rupture).toISOString(),
            detected_at: new Date(rupture + H + 10 * 60_000).toISOString(),
            excess_flow_lph: 780,
            currency: "EUR",
            status: "prise_en_compte",
            acknowledged_at: new Date(rupture + 2 * H).toISOString(),
            details: { explication: "Débit de 900 L/h, plus de 3 fois le maximum observé : canalisation rompue (bloc sanitaire B)." },
          })
          .select("id")
          .single(),
        "rupture",
      );
      await ok(admin.rpc("fuite_cloturer_reparee", { p_leak_id: f.id, p_source: "utilisateur", p_quand: new Date(rupture + 6 * H).toISOString(), p_par: null }), "réparation rupture");
    }
  }
  await activite(org.id, lesPins.id, 150, 0.55, 21);
  await activite(org.id, lac.id, 90, 0.5, 22);
  comptes.push(await compte("demo-camping-admin@example.com", org.id, "admin_client"));
  comptes.push(await compte("demo-camping-technicien@example.com", org.id, "technicien", "organisation", null, "+33600000003"));
  etape("Camping Partenaire Démo : 2 campings, marque « Aqua Camping Services »");
  return { org: org.id, sites: [lesPins.id, lac.id] };
}

// ---------------------------------------------------------------------------
// 4) Hôtel Bellecour Démo (pilote à J+20, kit A)
// ---------------------------------------------------------------------------
async function lyon(comptes) {
  const fuseau = "Europe/Paris";
  const org = await organisation({ nom: "Hôtel Bellecour Démo", kind: "sites", status: "essai", country: "FR", trial_ends_at: new Date(maintenant + 10 * J).toISOString(), slug: "hotel-bellecour-demo" });
  const source = await ok(admin.from("sources").insert({ organization_id: org.id, type: "saisie_manuelle", nom: "Démonstration" }).select("id").single(), "source Lyon");
  const pose = maintenant - 20 * J;
  const site = await ok(
    admin
      .from("sites")
      .insert({ organization_id: org.id, name: "Hôtel Bellecour", type: "hotel", city: "Lyon", timezone: fuseau, currency: "EUR", activity_unit: "nuitee", capacity: 45, occupancy_rate_default: 0.75 })
      .select("id")
      .single(),
    "Bellecour",
  );
  const debutFuite = maintenant - 3 * J;
  for (const [i, [type, zone, canal]] of [["general", "Général", "A"], ["cuisine", "Cuisine", "B"]].entries()) {
    const compteur = await ok(
      admin
        .from("meters")
        .insert({ organization_id: org.id, site_id: site.id, type: "point_comptage", numero_serie: `LYO-${i}`, nom: zone, zone, transmission: "cellulaire", pulse_weight_l: 1, installed_at: new Date(pose).toISOString() })
        .select("id")
        .single(),
      zone,
    );
    await ok(
      admin.from("devices").insert({ organization_id: org.id, site_id: site.id, meter_id: compteur.id, source_id: source.id, device_ref: "350000000000017", canal, model: "Adeunis PULSE NB-IoT/LTE-M", kit: "A", transmission: "cellulaire", provisioning_status: "actif", battery_pct: 97, rssi: -101, last_seen_at: new Date(maintenant - 50 * 60_000).toISOString() }),
      "Adeunis",
    );
    await inserer(
      "readings",
      releves({ organisation: org.id, compteur: compteur.id, source: source.id, fuseau, type, depuis: pose, jusqua: maintenant, graine: 9000 + i, facteur: 0.6, ajout: (t) => (type === "general" && t >= debutFuite ? 25 : 0) }),
      "relevés Lyon",
    );
  }
  await ok(
    admin.from("pilots").insert({ organization_id: org.id, site_id: site.id, started_at: new Date(pose).toISOString(), ends_at: new Date(pose + 30 * J).toISOString(), setup_refund_if_nothing_found: true, next_action: "Présenter la page preuve au directeur à J+25" }),
    "pilote",
  );
  await activite(org.id, site.id, 45, 0.75, 31);
  comptes.push(await compte("demo-lyon-admin@example.com", org.id, "admin_client"));
  comptes.push(await compte("demo-lyon-directeur@example.com", org.id, "directeur_site", "site", site.id, "+33600000004"));
  etape("Hôtel Bellecour Démo : pilote à J+20, fuite ouverte");
  return { org: org.id, sites: [site.id], pose };
}

// ---------------------------------------------------------------------------
// 5) Moteur, rapports, pages preuve
// ---------------------------------------------------------------------------
async function calculer(a, c, l) {
  // Bilans de 6 mois en trois passes de 61 jours (limite de calcul d'une
  // fonction), aux instants choisis en dehors de toute anomalie ; la
  // dernière passe, aujourd'hui, détecte les situations en cours (capteur
  // muet, sonde, fuites ouvertes).
  for (const site of [...a.sites, ...c.sites]) {
    for (const [recul, jours] of [[122, 61], [61, 61], [0, 61]]) {
      await fonction("gardien-moteur", { site_id: site, maintenant: new Date(maintenant - recul * J).toISOString(), jours });
    }
  }
  await fonction("gardien-moteur", { site_id: l.sites[0], maintenant: new Date(maintenant).toISOString(), jours: 21 });
  etape("moteur : 6 mois de bilans, détections du jour");

  // Rapports mensuels du mois dernier (le 1er, après 8 h à Paris comme à Casablanca).
  const premier = new Date(Date.UTC(new Date(maintenant).getUTCFullYear(), new Date(maintenant).getUTCMonth(), 1, 9, 0));
  for (const org of [a.org, c.org]) {
    await fonction("gardien-envois", { organization_id: org, maintenant: premier.toISOString(), sections: ["rapports"] });
  }
  // Rapports de première nuit et de première semaine du pilote.
  for (const jours of [1, 7]) {
    const jour = new Date(l.pose + jours * J);
    const matin = Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate(), 7, 0);
    await fonction("gardien-envois", { organization_id: l.org, maintenant: new Date(matin).toISOString(), sections: ["rapports"] });
  }
  // Alertes du jour (journal seulement).
  for (const org of [a.org, c.org, l.org]) {
    await fonction("gardien-envois", { organization_id: org, sections: ["fuites", "alertes"] });
  }
  etape("envois : rapports mensuels, première nuit, première semaine, alertes");

  const preuves = [];
  for (const site of [l.sites[0], a.sites[1]]) {
    const { token } = await fonction("gardien-envois", { page_preuve: site });
    preuves.push(token);
  }
  etape("pages preuve créées");
  return preuves;
}

// ---------------------------------------------------------------------------
try {
  await effacer();
  const comptes = [];
  const a = await atlas(comptes);
  const c = await camping(comptes);
  const l = await lyon(comptes);
  const preuves = await calculer(a, c, l);
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log("\nComptes de démonstration (mot de passe : " + motDePasse + ") :");
  for (const e of comptes) console.log(`  ${e}`);
  console.log(`\nConnexion à la marque du partenaire : ${site}/p/camping-partenaire-demo/connexion`);
  console.log("Pages preuve :");
  for (const t of preuves) console.log(`  ${site}/preuve/${t}`);
  etape("démonstration prête");
} catch (e) {
  console.error(`\nÉchec : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
