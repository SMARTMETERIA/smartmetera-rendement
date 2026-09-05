/** Nombre "1 234,56" ou "1234.56" -> 1234.56. Le dernier séparateur rencontré est décimal. */
export function parseLocaleNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let cleaned = trimmed.replace(/[\s ]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    cleaned =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (hasComma) {
    cleaned = cleaned.replace(",", ".");
  }

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}
