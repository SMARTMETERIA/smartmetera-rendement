/** Fonctionne en navigateur, Node et Deno (TextDecoder est disponible partout). */
export function decodeBytes(bytes: Uint8Array, encoding: string): string {
  const label =
    encoding.trim().toLowerCase() === "iso-8859-1" ? "iso-8859-1" : "utf-8";
  return new TextDecoder(label).decode(bytes);
}
