// Conversion XLSX -> CSV côté serveur : pour l'import normal, cette
// conversion se fait côté navigateur (voir src/lib/import/toCsv.ts et son
// commentaire) car process-import ne traite que du CSV. Pour un e-mail
// entrant, il n'y a pas d'étape navigateur : la conversion doit donc avoir
// lieu ici, avant l'upload vers le bucket "imports" (l'octet produit est
// toujours réencodé en UTF-8, indépendamment de l'encodage déclaré par le
// modèle d'import — voir supabase/functions/inbound-email).
import { parseExcel } from "../import/parseExcel";
import type { RawTable } from "../import/types";

export function construireCsv(table: RawTable, delimiter = ","): string {
  const echapper = (valeur: string): string => {
    if (
      valeur.includes(delimiter) ||
      valeur.includes('"') ||
      valeur.includes("\n") ||
      valeur.includes("\r")
    ) {
      return `"${valeur.replace(/"/g, '""')}"`;
    }
    return valeur;
  };
  const lignes = [table.headers, ...table.rows.map((r) => r.cells)];
  return lignes.map((ligne) => ligne.map(echapper).join(delimiter)).join("\r\n");
}

export function convertirXlsxEnCsv(
  bytes: Uint8Array,
  headerRow: number,
  delimiter = ",",
): string {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const table = parseExcel(buffer, headerRow);
  return construireCsv(table, delimiter);
}
