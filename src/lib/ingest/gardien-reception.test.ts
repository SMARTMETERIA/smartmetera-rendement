import { describe, expect, it } from "vitest";
import { decodeAdeunisPulseMqtt } from "./decoders/adeunisPulseMqtt";
import {
  decodeTemperatureObjet,
  lireChampNumerique,
} from "./decoders/temperatureObjet";
import { parseEnveloppeMqtt } from "./envelopes/mqtt";
import {
  evenementChirpstack,
  parseEnveloppeChirpstack,
  parseStatutChirpstack,
} from "./envelopes/chirpstack";
import { parseEnveloppeGenerique } from "./envelopes/generic";
import { estErreurEnveloppe } from "./envelopes";
import {
  imeiDepuisIdentifiant,
  imeiValide,
  normaliserReference,
} from "./reference";
import { niveauSurveillance } from "./surveillance";
import { appliquerPointReleve } from "./computeDelta";

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const CONTEXTE = { recuLe: "2026-09-28T10:00:00.000Z" };

// Exemples officiels du guide Adeunis « User Guide PULSE MQTTS NB-IoT/LTE-M »
// v1.1, recopiés tels quels.
const MESSAGE_ANNEXE_3 = {
  sn: "8420AAA02324000160",
  lowbat: false,
  CHA: [{ v: 3476, t: 1717139824 }],
  CHB: [{ v: 0, t: 1717139824 }],
};
const LIVE_OBJECTS_PAGE_15 = {
  id: "65646769a3760b7ac540f823",
  streamId: "urn:lo:nsid:imei:351358816993213",
  timestamp: "2023-11-27T09:54:49.083Z",
  value: {
    sn: "351516174936096",
    lowbat: false,
    CHA: [
      { v: 0, t: 1701078583 },
      { v: 0, t: 1701078883 },
    ],
    CHB: [
      { v: 0, t: 1701078583 },
      { v: 50, t: 1701078883 },
    ],
    txInfo: {
      snr: 10,
      rsrp: -98,
      rsrq: -14,
      txPower: 22,
      nbReboot: 6,
      t3324: 16,
    },
  },
  tags: [],
  extra: {},
  metadata: {
    source: "urn:lo:nsid:imei:351358816993213",
    group: { id: "root", path: "/" },
    connector: "mqtt",
    network: { mqtt: { clientId: "urn:imei:351358816993213" } },
  },
  created: "2023-11-27T09:54:49.083Z",
};

describe("décodeur Adeunis PULSE MQTTS", () => {
  it("décode l'exemple de l'annexe 3 (sans historique)", () => {
    const d = decodeAdeunisPulseMqtt(enc(MESSAGE_ANNEXE_3));
    expect(d.points).toEqual([
      {
        horodatage: "2024-05-31T07:17:04.000Z",
        canal: "A",
        nature: "index",
        impulsions: 3476,
      },
      {
        horodatage: "2024-05-31T07:17:04.000Z",
        canal: "B",
        nature: "index",
        impulsions: 0,
      },
    ]);
    expect(d.brut).toMatchObject({
      numeroSerie: "8420AAA02324000160",
      batterieFaible: false,
    });
  });

  it("garde l'historique dans l'ordre chronologique avec la qualité radio", () => {
    const d = decodeAdeunisPulseMqtt(enc(LIVE_OBJECTS_PAGE_15.value));
    expect(d.points.map((p) => [p.canal, p.impulsions])).toEqual([
      ["A", 0],
      ["B", 0],
      ["A", 0],
      ["B", 50],
    ]);
    expect(d.brut).toMatchObject({ rsrp: -98, snr: 10 });
  });

  it("utilise l'index net en mode sens d'écoulement (annexe 4)", () => {
    const d = decodeAdeunisPulseMqtt(
      enc({
        sn: "358447177483477",
        lowbat: false,
        CHA: [{ v: 161637, f: 161994, b: 357, r: 1, t: 1730307595 }],
      }),
    );
    expect(d.points).toEqual([
      {
        horodatage: "2024-10-30T16:59:55.000Z",
        canal: "A",
        nature: "index",
        impulsions: 161637,
      },
    ]);
    expect(d.brut).toMatchObject({ impulsionsRetour: 357 });
  });

  it("signale une pile faible", () => {
    const d = decodeAdeunisPulseMqtt(
      enc({ ...MESSAGE_ANNEXE_3, lowbat: true }),
    );
    expect(d.brut?.batterieFaible).toBe(true);
  });

  it("refuse un message sans mesure ou mal formé", () => {
    expect(() => decodeAdeunisPulseMqtt(enc({ sn: "x" }))).toThrow(
      /Aucune mesure/,
    );
    expect(() =>
      decodeAdeunisPulseMqtt(enc({ CHA: [{ v: -1, t: 1 }] })),
    ).toThrow(/index/);
    expect(() =>
      decodeAdeunisPulseMqtt(new TextEncoder().encode("pas du json")),
    ).toThrow(/JSON/);
  });

  it("donne des volumes exacts avec le calcul de delta existant", () => {
    const d = decodeAdeunisPulseMqtt(enc(LIVE_OBJECTS_PAGE_15.value));
    const voieB = d.points.filter((p) => p.canal === "B");
    const premier = appliquerPointReleve(
      { dernierIndexImpulsions: null, dernierHorodatage: null },
      voieB[0],
      10,
      2 ** 32 - 1,
    );
    expect(premier.ignorer).toBe(true);
    const second = appliquerPointReleve(
      premier.nouvelEtat,
      voieB[1],
      10,
      2 ** 32 - 1,
    );
    expect(second.volumeM3).toBe(0.5); // 50 impulsions de 10 L
  });
});

describe("enveloppe MQTT (kit A)", () => {
  it("lit l'exemple Live Objects du guide Adeunis (page 15)", () => {
    const e = parseEnveloppeMqtt(LIVE_OBJECTS_PAGE_15);
    expect(estErreurEnveloppe(e)).toBe(false);
    if (estErreurEnveloppe(e)) return;
    expect(e.devEui).toBe("351358816993213");
    expect(e.recuLe).toBe("2023-11-27T09:54:43.000Z");
    expect(e.rssi).toBe(-98);
    expect(e.snr).toBe(10);
    expect(JSON.parse(new TextDecoder().decode(e.payload))).toEqual(
      LIVE_OBJECTS_PAGE_15.value,
    );
  });

  // Forme supposée d'un transfert HTTP de broker (EMQX, HiveMQ…) — non
  // tirée d'une documentation : TODO(RAYAN), à confirmer avec le broker.
  it("lit un transfert de broker avec le message en texte ou en base64", () => {
    const texte = parseEnveloppeMqtt({
      clientid: "urn:imei:351358816993213",
      topic: "smartmetera/pulse",
      payload: JSON.stringify(MESSAGE_ANNEXE_3),
    });
    expect(estErreurEnveloppe(texte)).toBe(false);
    if (!estErreurEnveloppe(texte))
      expect(texte.devEui).toBe("351358816993213");

    const base64 = parseEnveloppeMqtt({
      clientId: "urn:imei:351358816993213",
      payload: btoa(JSON.stringify(MESSAGE_ANNEXE_3)),
    });
    expect(estErreurEnveloppe(base64)).toBe(false);
  });

  it("trouve l'IMEI dans le sujet ou dans un numéro de série de 15 chiffres", () => {
    const sujet = parseEnveloppeMqtt({
      topic: "clients/351358816993213/uplink",
      payload: MESSAGE_ANNEXE_3,
    });
    expect(!estErreurEnveloppe(sujet) && sujet.devEui).toBe("351358816993213");
    const sn = parseEnveloppeMqtt(LIVE_OBJECTS_PAGE_15.value);
    expect(!estErreurEnveloppe(sn) && sn.devEui).toBe("351516174936096");
  });

  it("refuse un message sans IMEI ni mesure", () => {
    expect(estErreurEnveloppe(parseEnveloppeMqtt(MESSAGE_ANNEXE_3))).toBe(true);
    expect(
      estErreurEnveloppe(
        parseEnveloppeMqtt({ clientid: "urn:imei:351358816993213" }),
      ),
    ).toBe(true);
    expect(estErreurEnveloppe(parseEnveloppeMqtt("texte"))).toBe(true);
  });
});

describe("ChirpStack (kit C et sondes)", () => {
  it("retient la meilleure réception et l'objet décodé", () => {
    const e = parseEnveloppeChirpstack({
      deviceInfo: { devEui: "24e124136b1234ab" },
      time: "2026-09-28T01:00:00Z",
      fCnt: 4,
      fPort: 85,
      data: "BcgKAAAA",
      rxInfo: [
        { gatewayId: "a", rssi: -110, snr: -3 },
        { gatewayId: "b", rssi: -90, snr: 7.5 },
      ],
      object: { temperature: 57.3 },
    });
    expect(estErreurEnveloppe(e)).toBe(false);
    if (estErreurEnveloppe(e)) return;
    expect(e.devEui).toBe("24E124136B1234AB");
    expect(e.rssi).toBe(-90);
    expect(e.snr).toBe(7.5);
    expect(e.objet).toEqual({ temperature: 57.3 });
  });

  it("lit le niveau de pile de l'événement status", () => {
    expect(
      parseStatutChirpstack({
        deduplicationId: "bf2a9746-1c8b-49be-a92e-f0b89c8534e4",
        time: "2022-07-18T09:35:06.927172638+00:00",
        deviceInfo: { devEui: "0101010101010101" },
        margin: 10,
        batteryLevel: 88.3,
      }),
    ).toEqual({ devEui: "0101010101010101", batteriePct: 88.3, marge: 10 });
    expect(
      parseStatutChirpstack({
        deviceInfo: { devEui: "0101010101010101" },
        batteryLevelUnavailable: true,
      }),
    ).toEqual({
      devEui: "0101010101010101",
      batteriePct: undefined,
      marge: undefined,
    });
  });

  it("distingue les événements par le paramètre d'adresse", () => {
    expect(evenementChirpstack("https://x/ingest/chirpstack/j?event=up")).toBe(
      "up",
    );
    expect(evenementChirpstack("https://x/ingest/chirpstack/j")).toBe("up");
    expect(
      evenementChirpstack("https://x/ingest/chirpstack/j?event=status"),
    ).toBe("status");
    expect(
      evenementChirpstack("https://x/ingest/chirpstack/j?event=join"),
    ).toBe("autre");
  });
});

describe("sonde de température", () => {
  it("lit la température décodée par le serveur réseau", () => {
    expect(
      decodeTemperatureObjet(new Uint8Array(), {
        ...CONTEXTE,
        objet: { temperature: 56.4 },
      }).brut,
    ).toEqual({ temperatureC: 56.4 });
    expect(
      lireChampNumerique({ capteur: { temp: "51,5" } }, "capteur.temp"),
    ).toBe(51.5);
  });

  it("refuse une température absente ou impossible", () => {
    expect(() => decodeTemperatureObjet(new Uint8Array(), CONTEXTE)).toThrow(
      /serveur réseau/,
    );
    expect(() =>
      decodeTemperatureObjet(new Uint8Array(), {
        ...CONTEXTE,
        objet: { temperature: 400 },
      }),
    ).toThrow(/plage/);
  });

  it("passe par l'enveloppe générique pour les essais", () => {
    const e = parseEnveloppeGenerique({
      dev_eui: "a84041000181c0de",
      payload_hex: "",
      objet: { temperature: 55 },
    });
    expect(!estErreurEnveloppe(e) && e.objet).toEqual({ temperature: 55 });
  });
});

describe("références d'appareils", () => {
  it("normalise DevEUI et IMEI", () => {
    expect(normaliserReference("24:e1:24:13:6b:12:34:ab")).toBe(
      "24E124136B1234AB",
    );
    expect(normaliserReference(" 351358816993213 ")).toBe("351358816993213");
    expect(normaliserReference("abc")).toBeNull();
  });

  it("contrôle la clé de l'IMEI", () => {
    expect(imeiValide("351358816993213")).toBe(true);
    expect(imeiValide("351358816993214")).toBe(false);
  });

  it("extrait l'IMEI des identifiants MQTT et Live Objects", () => {
    expect(imeiDepuisIdentifiant("urn:imei:351358816993213")).toBe(
      "351358816993213",
    );
    expect(imeiDepuisIdentifiant("urn:lo:nsid:imei:351358816993213")).toBe(
      "351358816993213",
    );
    expect(imeiDepuisIdentifiant("capteur-12")).toBeNull();
  });
});

describe("contrôle de fréquence", () => {
  const heure = (h: number, m = 0) =>
    new Date(Date.UTC(2026, 8, 28, h, m)).toISOString();

  it("accepte des relevés horaires ou plus fréquents", () => {
    expect(niveauSurveillance([heure(1), heure(2), heure(3)])).toBe("complete");
    expect(niveauSurveillance([heure(1), heure(1, 15), heure(1, 30)])).toBe(
      "complete",
    );
    expect(niveauSurveillance([heure(1), heure(2, 5)])).toBe("complete");
  });

  it("classe en surveillance limitée au-delà d'une heure", () => {
    expect(niveauSurveillance([heure(0), heure(6), heure(12)])).toBe("limitee");
    expect(
      niveauSurveillance(["2026-09-27T00:00:00Z", "2026-09-28T00:00:00Z"]),
    ).toBe("limitee");
  });

  it("ne conclut pas avec un seul relevé", () => {
    expect(niveauSurveillance([heure(1)])).toBeNull();
    expect(niveauSurveillance([heure(1), heure(1)])).toBeNull();
  });
});
