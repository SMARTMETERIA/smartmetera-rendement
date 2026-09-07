// Boîte mail entrante : reçoit un webhook Postmark (JSON) ou Mailgun
// (multipart/form-data) quand un e-mail arrive sur l'adresse dédiée d'une
// source (routage par jeton, voir src/lib/inboundMail/token.ts — pas de
// secret supplémentaire dans l'URL : le jeton par source (32 caractères
// hex, imprévisible) est la seule protection, comme pour /ingest).
//
// Pipeline : enveloppe -> source (par jeton) -> modèle d'import par défaut
// -> première pièce jointe CSV/XLSX reconnue (XLSX converti en CSV ici,
// aucune conversion possible côté navigateur pour un e-mail) -> upload dans
// le bucket "imports" + import_jobs, exactement comme l'upload manuel
// (aucune réimplémentation du parsing/mapping : on invoque process-import
// et on attend son résultat) -> accusé de réception ou e-mail d'erreur par
// Resend, avec le rapport d'erreurs en pièce jointe si des lignes ont été
// rejetées -> journalisation dans inbound_emails (jamais de perte
// silencieuse, voir CLAUDE.md).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseEmailPostmark } from "./lib/envelopes/postmark.ts";
import { parseEmailMailgun, verifierSignatureMailgun } from "./lib/envelopes/mailgun.ts";
import { convertirXlsxEnCsv } from "./lib/xlsxToCsv.ts";
import {
  construireEmailAccuseReception,
  construireEmailErreurImport,
} from "./lib/inboundAckEmail.ts";
import { bytesToBase64 } from "./lib/bytes.ts";
import type { EmailEntrant, ErreurEnveloppe } from "./lib/types.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
const resendFrom = Deno.env.get("RESEND_FROM_EMAIL")!;
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000";
const mailgunSigningKey = Deno.env.get("MAILGUN_SIGNING_KEY");

const EXT_CSV = new Set(["csv", "txt"]);
const EXT_XLSX = new Set(["xlsx", "xls"]);

function extension(nom: string): string {
  const idx = nom.lastIndexOf(".");
  return idx === -1 ? "" : nom.slice(idx + 1).toLowerCase();
}

function estErreurEnveloppe(v: EmailEntrant | ErreurEnveloppe): v is ErreurEnveloppe {
  return "erreur" in v;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function envoyerEmail(
  destinataires: string[],
  rendu: { subject: string; html: string; text: string },
  piecesJointes?: { filename: string; content: string }[],
) {
  const body: Record<string, unknown> = {
    from: resendFrom,
    to: destinataires,
    subject: rendu.subject,
    html: rendu.html,
    text: rendu.text,
  };
  if (piecesJointes && piecesJointes.length > 0) body.attachments = piecesJointes;

  const reponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!reponse.ok) {
    throw new Error(`Resend a répondu ${reponse.status} : ${await reponse.text()}`);
  }
}

Deno.serve(async (req: Request) => {
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const idx = segments.indexOf("inbound-email");
  const plateforme = idx !== -1 ? segments[idx + 1] : undefined;

  if (req.method !== "POST") {
    return json({ erreur: "Méthode non autorisée, POST attendu" }, 405);
  }
  if (plateforme !== "postmark" && plateforme !== "mailgun") {
    return json(
      { erreur: "Route inconnue, attendu /inbound-email/postmark ou /inbound-email/mailgun" },
      404,
    );
  }

  let enveloppe: EmailEntrant | ErreurEnveloppe;

  if (plateforme === "postmark") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ erreur: "Corps de requête JSON invalide" }, 400);
    }
    enveloppe = parseEmailPostmark(body);
  } else {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ erreur: "Corps de requête multipart invalide" }, 400);
    }
    if (mailgunSigningKey) {
      const timestamp = form.get("timestamp");
      const token = form.get("token");
      const signature = form.get("signature");
      const valide =
        typeof timestamp === "string" &&
        typeof token === "string" &&
        typeof signature === "string" &&
        (await verifierSignatureMailgun(timestamp, token, signature, mailgunSigningKey));
      if (!valide) {
        return json({ erreur: "Signature Mailgun invalide" }, 401);
      }
    }
    enveloppe = await parseEmailMailgun(form);
  }

  if (estErreurEnveloppe(enveloppe)) {
    return json({ ok: false, statut: "erreur", erreur: enveloppe.erreur }, 200);
  }
  if (!enveloppe.token) {
    return json({ ok: false, statut: "source_inconnue" }, 200);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: source } = await admin
    .from("sources")
    .select("id, organization_id, default_template_id, actif")
    .eq("inbound_token", enveloppe.token)
    .eq("type", "email_entrant")
    .maybeSingle();

  if (!source || !source.actif) {
    return json({ ok: false, statut: "source_inconnue" }, 200);
  }

  const { data: org } = await admin
    .from("organizations")
    .select("nom")
    .eq("id", source.organization_id)
    .single();
  const orgNom = org?.nom ?? "Organisation";

  const { data: template } = await admin
    .from("import_templates")
    .select("config")
    .eq("id", source.default_template_id)
    .single();
  const config = template?.config as Record<string, unknown> | undefined;

  async function journaliser(
    statut: string,
    opts: { importJobId?: string; pieceJointeNom?: string; erreur?: string },
  ) {
    await admin.from("inbound_emails").insert({
      organization_id: source.organization_id,
      source_id: source.id,
      import_job_id: opts.importJobId ?? null,
      expediteur: (enveloppe as EmailEntrant).expediteur,
      objet: (enveloppe as EmailEntrant).objet,
      piece_jointe_nom: opts.pieceJointeNom ?? null,
      statut,
      erreur: opts.erreur ?? null,
    });
  }

  const piece = enveloppe.piecesJointes.find(
    (p) => EXT_CSV.has(extension(p.nomFichier)) || EXT_XLSX.has(extension(p.nomFichier)),
  );

  if (!piece || !config) {
    const raison = !config
      ? "Aucun modèle d'import par défaut configuré pour cette source."
      : "Aucune pièce jointe CSV ou XLSX reconnue dans cet e-mail.";
    await journaliser("piece_jointe_manquante", { erreur: raison });
    if (enveloppe.expediteur) {
      try {
        await envoyerEmail(
          [enveloppe.expediteur],
          construireEmailErreurImport(orgNom, null, raison, siteUrl),
        );
      } catch {
        // déjà journalisé côté inbound_emails
      }
    }
    return json({ ok: false, statut: "piece_jointe_manquante" });
  }

  let contenu: Uint8Array;
  let mapping: Record<string, unknown>;
  const ext = extension(piece.nomFichier);
  if (EXT_XLSX.has(ext)) {
    const delimiter = typeof config.delimiter === "string" ? config.delimiter : ",";
    const headerRow = typeof config.header_row === "number" ? config.header_row : 1;
    const csvTexte = convertirXlsxEnCsv(piece.contenu, headerRow, delimiter);
    contenu = new TextEncoder().encode(csvTexte);
    // Toujours réencodé en UTF-8 par convertirXlsxEnCsv : on l'indique
    // explicitement dans le job, indépendamment de l'encodage déclaré par
    // le modèle (qui décrit l'export CSV natif, pas notre conversion).
    mapping = { ...config, encoding: "utf-8" };
  } else {
    contenu = piece.contenu;
    mapping = { ...config };
  }

  const { data: job, error: jobError } = await admin
    .from("import_jobs")
    .insert({
      organization_id: source.organization_id,
      source_id: source.id,
      template_id: source.default_template_id,
      statut: "en_attente",
      fichier_nom: piece.nomFichier,
      mapping,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    const raison = `Création de la tâche d'import impossible : ${jobError?.message}`;
    await journaliser("erreur", { pieceJointeNom: piece.nomFichier, erreur: raison });
    return json({ ok: false, statut: "erreur", erreur: raison });
  }

  const filePath = `${source.organization_id}/${job.id}/donnees.csv`;
  const { error: uploadError } = await admin.storage
    .from("imports")
    .upload(filePath, new Blob([contenu], { type: "text/csv" }), { contentType: "text/csv" });

  if (uploadError) {
    const raison = `Envoi du fichier impossible : ${uploadError.message}`;
    await journaliser("erreur", {
      importJobId: job.id,
      pieceJointeNom: piece.nomFichier,
      erreur: raison,
    });
    return json({ ok: false, statut: "erreur", erreur: raison });
  }

  await admin.from("import_jobs").update({ file_path: filePath }).eq("id", job.id);

  const { error: invokeError } = await admin.functions.invoke("process-import", {
    body: { jobId: job.id },
  });

  const { data: jobFinal } = await admin
    .from("import_jobs")
    .select("statut, nb_lignes_importees, nb_lignes_rejetees, nb_lignes_ignorees, rapport_erreurs_path, erreurs")
    .eq("id", job.id)
    .single();

  if (invokeError || !jobFinal || jobFinal.statut === "echec") {
    // deno-lint-ignore no-explicit-any
    const premiereErreur = (jobFinal?.erreurs as any[] | null)?.[0]?.reason as string | undefined;
    const raison = premiereErreur ?? invokeError?.message ?? "Le traitement du fichier a échoué.";
    await journaliser("erreur", {
      importJobId: job.id,
      pieceJointeNom: piece.nomFichier,
      erreur: raison,
    });
    if (enveloppe.expediteur) {
      try {
        await envoyerEmail(
          [enveloppe.expediteur],
          construireEmailErreurImport(orgNom, piece.nomFichier, raison, siteUrl),
        );
      } catch {
        // déjà journalisé
      }
    }
    return json({ ok: false, statut: "erreur", erreur: raison });
  }

  await journaliser("traite", { importJobId: job.id, pieceJointeNom: piece.nomFichier });

  if (enveloppe.expediteur) {
    const rendu = construireEmailAccuseReception(
      orgNom,
      {
        fichierNom: piece.nomFichier,
        nbLignesImportees: jobFinal.nb_lignes_importees ?? 0,
        nbLignesRejetees: jobFinal.nb_lignes_rejetees ?? 0,
        nbLignesIgnorees: jobFinal.nb_lignes_ignorees ?? 0,
      },
      siteUrl,
    );

    let piecesJointesResend: { filename: string; content: string }[] | undefined;
    if (jobFinal.rapport_erreurs_path && (jobFinal.nb_lignes_rejetees ?? 0) > 0) {
      const { data: rapportBlob } = await admin.storage
        .from("imports")
        .download(jobFinal.rapport_erreurs_path);
      if (rapportBlob) {
        const buf = new Uint8Array(await rapportBlob.arrayBuffer());
        piecesJointesResend = [{ filename: "rapport-erreurs.csv", content: bytesToBase64(buf) }];
      }
    }
    try {
      await envoyerEmail([enveloppe.expediteur], rendu, piecesJointesResend);
    } catch {
      // déjà journalisé côté import_jobs/inbound_emails
    }
  }

  return json({ ok: true, statut: "traite", importJobId: job.id, ...jobFinal });
});
