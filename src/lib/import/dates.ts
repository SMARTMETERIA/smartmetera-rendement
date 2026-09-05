/**
 * Parseur de date minimal basé sur un format à tokens (YYYY, MM, DD, HH, mm,
 * ss) — évite une dépendance de date supplémentaire pour un besoin borné aux
 * formats des modèles d'import. Les horodatages source sont supposés en
 * heure locale Europe/Paris (voir CLAUDE.md) et convertis en UTC.
 */

const TOKEN_ORDER = ["YYYY", "MM", "DD", "HH", "mm", "ss"] as const;

function escapeRegExp(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(format: string): RegExp {
  let pattern = "";
  let i = 0;
  while (i < format.length) {
    const token = TOKEN_ORDER.find((t) => format.startsWith(t, i));
    if (token) {
      pattern += `(?<${token}>\\d{${token === "YYYY" ? 4 : 2}})`;
      i += token.length;
    } else {
      pattern += escapeRegExp(format[i]);
      i += 1;
    }
  }
  return new RegExp(`^${pattern}$`);
}

/** Convertit une heure locale (année..secondes) d'un fuseau donné en UTC, DST inclus. */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(new Date(utcGuess));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offset = asIfUtc - utcGuess;
  return new Date(utcGuess - offset);
}

const formatRegexCache = new Map<string, RegExp>();

export function parseDate(
  value: string,
  format: string,
  timeZone = "Europe/Paris",
): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let regex = formatRegexCache.get(format);
  if (!regex) {
    regex = buildRegex(format);
    formatRegexCache.set(format, regex);
  }

  const match = regex.exec(trimmed);
  if (!match?.groups) return null;

  const year = Number(match.groups.YYYY ?? "1970");
  const month = Number(match.groups.MM ?? "01");
  const day = Number(match.groups.DD ?? "01");
  const hour = Number(match.groups.HH ?? "00");
  const minute = Number(match.groups.mm ?? "00");
  const second = Number(match.groups.ss ?? "00");

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const date = zonedTimeToUtc(year, month, day, hour, minute, second, timeZone);
  return Number.isNaN(date.getTime()) ? null : date;
}
