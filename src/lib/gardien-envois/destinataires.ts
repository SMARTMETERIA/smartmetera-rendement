// Qui prévenir, et quand (plan, section 3 et phase G5) : alerte au
// technicien par SMS et e-mail, appel vocal (France) ou WhatsApp (Maroc)
// après 2 h sans prise en charge, escalade au directeur après 12 h.
// Capteur muet : au partenaire ou à SmartMeteria, jamais au client en
// premier. Un lecteur ne reçoit jamais d'alerte.

export interface Membre {
  userId: string;
  email: string | null;
  telephone: string | null;
  role: string;
  portee: "organisation" | "site";
  siteId: string | null;
}

function uniques(membres: Membre[]): Membre[] {
  const vus = new Set<string>();
  return membres.filter((m) => (vus.has(m.userId) ? false : (vus.add(m.userId), true)));
}

const org = (m: Membre, roles: string[]) => m.portee === "organisation" && roles.includes(m.role);
const duSite = (m: Membre, siteId: string, roles: string[]) =>
  m.portee === "site" && m.siteId === siteId && roles.includes(m.role);

/** Techniciens du site (organisation ou site) ; à défaut, admins et agents. */
export function responsablesAlerte(membres: Membre[], siteId: string): Membre[] {
  const techniciens = membres.filter(
    (m) => org(m, ["technicien"]) || duSite(m, siteId, ["technicien"]),
  );
  return uniques(
    techniciens.length ? techniciens : membres.filter((m) => org(m, ["admin_client", "agent"])),
  );
}

/** Directeurs du site ; à défaut, administrateurs de l'organisation. */
export function directeursDuSite(membres: Membre[], siteId: string): Membre[] {
  const directeurs = membres.filter((m) => duSite(m, siteId, ["directeur_site"]));
  return uniques(directeurs.length ? directeurs : membres.filter((m) => org(m, ["admin_client"])));
}

/** Le client d'un site : ses directeurs et les administrateurs. */
export function clientDuSite(membres: Membre[], siteId: string): Membre[] {
  return uniques(
    membres.filter((m) => duSite(m, siteId, ["directeur_site"]) || org(m, ["admin_client"])),
  );
}

/** Équipe de l'organisation (partenaire ou exploitant), sans les directeurs. */
export function equipeOrganisation(membres: Membre[]): Membre[] {
  return uniques(membres.filter((m) => org(m, ["admin_client", "agent", "technicien"])));
}

/** Température et analyses : directeurs et techniciens du site. */
export function equipeDuSite(membres: Membre[], siteId: string): Membre[] {
  return uniques([...directeursDuSite(membres, siteId), ...responsablesAlerte(membres, siteId)]);
}

export type EtapeFuite = "initial" | "appel" | "directeur";

/**
 * Étapes dues pour une fuite encore « ouverte » (personne n'a cliqué
 * « Je m'en occupe »). Une fuite prise en charge n'est plus relancée.
 */
export function etapesDues(params: {
  statut: string;
  detecteeMs: number;
  maintenantMs: number;
  appelH: number;
  directeurH: number;
}): EtapeFuite[] {
  if (params.statut !== "ouverte") return [];
  const heures = (params.maintenantMs - params.detecteeMs) / 3_600_000;
  const etapes: EtapeFuite[] = ["initial"];
  if (heures >= params.appelH) etapes.push("appel");
  if (heures >= params.directeurH) etapes.push("directeur");
  return etapes;
}

/**
 * Relance après 2 h : appel en France, WhatsApp au Maroc et en RDC.
 * TODO(RAYAN) : confirmer WhatsApp pour la RDC.
 */
export function canalRelance(pays: string): "appel" | "whatsapp" {
  return pays === "MA" || pays === "CD" ? "whatsapp" : "appel";
}
