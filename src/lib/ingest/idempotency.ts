// Clé d'idempotence d'une trame reçue : privilégie le compteur de trame
// LoRaWAN (fCnt) quand la plateforme le fournit (le réseau peut renvoyer la
// même trame plusieurs fois en cas de retry HTTP), sinon retombe sur
// l'horodatage. Unique par source (voir raw_frames_source_idempotency_uniq).
export function construireCleIdempotence(params: {
  devEui: string;
  canal: string | null;
  fCnt?: number;
  horodatage: string;
}): string {
  const canal = params.canal ?? "-";
  if (params.fCnt !== undefined) {
    return `${params.devEui}:${canal}:fcnt:${params.fCnt}`;
  }
  return `${params.devEui}:${canal}:ts:${params.horodatage}`;
}
