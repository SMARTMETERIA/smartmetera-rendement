// Lecture d'entiers non signés et conversions hex/base64, sans dépendance
// (Buffer indisponible en LoRaWAN "generic" côté navigateur pour le testeur
// de trame, atob/btoa suffisent). Dupliqué dans supabase/functions/ingest/lib.

export function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

export function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset + 3] << 24) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 1] << 8) |
      bytes[offset]) >>>
    0
  );
}

export function readUInt16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0;
}

export function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset + 1] << 8) | bytes[offset]) >>> 0;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "").replace(/\s+/g, "");
  if (clean.length % 2 !== 0) {
    throw new Error(`Hexadécimal de longueur impaire : "${hex}"`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = clean.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-f]{2}$/i.test(byte)) {
      throw new Error(`Octet hexadécimal invalide : "${byte}"`);
    }
    bytes[i] = parseInt(byte, 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
