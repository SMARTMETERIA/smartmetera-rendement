const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function findHeaderIndex(headers: string[], target: string): number {
  if (!target) return -1;
  const normalizedTarget = normalizeHeader(target);
  return headers.findIndex((h) => normalizeHeader(h) === normalizedTarget);
}
