import { notFound } from "next/navigation";
import { lireJournal } from "@/lib/email/envoyer";

export const dynamic = "force-dynamic";

const FORMAT_DATE = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Europe/Paris",
});

function liensDuTexte(texte: string): string[] {
  return [...new Set(texte.match(/https?:\/\/[^\s)]+/g) ?? [])];
}

/**
 * Boîte de réception de test (développement uniquement) : les e-mails que
 * l'application aurait envoyés, avec leurs liens cliquables. Introuvable
 * en production.
 */
export default async function EmailsDevPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const emails = await lireJournal(30);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Boîte de réception de test
        </h1>
        <p className="text-muted-foreground text-sm">
          En développement, aucun e-mail ne part : ils arrivent ici. Les 30
          plus récents, du plus récent au plus ancien. Rechargez la page après
          une action.
        </p>
      </div>
      {emails.length === 0 && (
        <p className="text-muted-foreground text-sm">Aucun e-mail pour l&apos;instant.</p>
      )}
      {emails.map((e) => {
        const liens = liensDuTexte(e.text);
        return (
          <article key={e.id} className="space-y-3 rounded-lg border p-4">
            <header className="space-y-1">
              <p className="font-medium">{e.subject}</p>
              <p className="text-muted-foreground text-sm">
                À {e.to} · de {e.fromName ?? "—"} ·{" "}
                {FORMAT_DATE.format(new Date(e.date))}
              </p>
            </header>
            {liens.length > 0 && (
              <ul className="space-y-1">
                {liens.map((lien) => (
                  <li key={lien}>
                    <a href={lien} className="text-sm break-all underline underline-offset-4">
                      {lien.includes("/auth/confirmer") ? "Ouvrir le lien de l'e-mail" : lien}
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary className="text-muted-foreground cursor-pointer text-sm">
                Voir l&apos;e-mail tel qu&apos;il sera reçu
              </summary>
              <iframe
                title={e.subject}
                srcDoc={e.html}
                sandbox=""
                className="mt-2 h-[520px] w-full rounded border bg-white"
              />
            </details>
          </article>
        );
      })}
    </main>
  );
}
