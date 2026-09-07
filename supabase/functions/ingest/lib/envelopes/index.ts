import type { EnveloppeUplink, ErreurEnveloppe } from "../types.ts";
import { parseEnveloppeTtn } from "./ttn.ts";
import { parseEnveloppeChirpstack } from "./chirpstack.ts";
import { parseEnveloppeLiveObjects } from "./liveobjects.ts";
import { parseEnveloppeGenerique } from "./generic.ts";

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
