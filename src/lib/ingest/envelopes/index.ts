import type { EnveloppeUplink, ErreurEnveloppe } from "../types";
import { parseEnveloppeTtn } from "./ttn";
import { parseEnveloppeChirpstack } from "./chirpstack";
import { parseEnveloppeLiveObjects } from "./liveobjects";
import { parseEnveloppeGenerique } from "./generic";

export type Plateforme = "ttn" | "chirpstack" | "liveobjects" | "generic";

export const PARSEURS_ENVELOPPE: Record<
  Plateforme,
  (body: unknown) => EnveloppeUplink | ErreurEnveloppe
> = {
  ttn: parseEnveloppeTtn,
  chirpstack: parseEnveloppeChirpstack,
  liveobjects: parseEnveloppeLiveObjects,
  generic: parseEnveloppeGenerique,
};

export function estErreurEnveloppe(
  v: EnveloppeUplink | ErreurEnveloppe,
): v is ErreurEnveloppe {
  return "erreur" in v;
}
