import { describe, it, expect } from "vitest";
import { parseEnveloppeTtn } from "./ttn";
import { parseEnveloppeChirpstack } from "./chirpstack";
import { parseEnveloppeLiveObjects } from "./liveobjects";
import { parseEnveloppeGenerique } from "./generic";
import { estErreurEnveloppe } from "./index";
import { bytesToHex } from "../bytes";

describe("parseEnveloppeTtn", () => {
  it("extrait devEui/fPort/fCnt/payload d'un webhook TTN v3", () => {
    const body = {
      end_device_ids: { dev_eui: "70b3d57ed0012345" },
      received_at: "2026-09-07T10:00:00Z",
      uplink_message: {
        f_port: 2,
        f_cnt: 12,
        frm_payload: "RiAAAVxPAAD3Sg==", // 46 20 00015C4F 0000F74A
      },
    };
    const res = parseEnveloppeTtn(body);
    expect(estErreurEnveloppe(res)).toBe(false);
    if (estErreurEnveloppe(res)) return;
    expect(res.devEui).toBe("70B3D57ED0012345");
    expect(res.fPort).toBe(2);
    expect(res.fCnt).toBe(12);
    expect(bytesToHex(res.payload)).toBe("462000015c4f0000f74a");
  });

  it("signale une erreur si dev_eui manquant", () => {
    const res = parseEnveloppeTtn({ uplink_message: {} });
    expect(estErreurEnveloppe(res)).toBe(true);
  });
});

describe("parseEnveloppeChirpstack", () => {
  it("extrait devEui/fCnt/fPort/data d'un événement up ChirpStack v4", () => {
    const body = {
      deviceInfo: { devEui: "0101010101010101" },
      time: "2026-09-07T10:00:00Z",
      fCnt: 12,
      fPort: 1,
      data: "qg==",
    };
    const res = parseEnveloppeChirpstack(body);
    expect(estErreurEnveloppe(res)).toBe(false);
    if (estErreurEnveloppe(res)) return;
    expect(res.devEui).toBe("0101010101010101");
    expect(res.fCnt).toBe(12);
    expect(bytesToHex(res.payload)).toBe("aa");
  });
});

describe("parseEnveloppeLiveObjects", () => {
  it("extrait devEui/port/fcnt/value d'un message DATA Live Objects", () => {
    const body = {
      timestamp: "2016-05-23T13:05:18.307Z",
      value: "ae2109000cf3",
      metadata: {
        network: { lora: { devEUI: "0018b20000000272", port: 2, fcnt: 42 } },
      },
    };
    const res = parseEnveloppeLiveObjects(body);
    expect(estErreurEnveloppe(res)).toBe(false);
    if (estErreurEnveloppe(res)) return;
    expect(res.devEui).toBe("0018B20000000272");
    expect(res.fPort).toBe(2);
    expect(res.fCnt).toBe(42);
    expect(bytesToHex(res.payload)).toBe("ae2109000cf3");
  });
});

describe("parseEnveloppeGenerique", () => {
  it("accepte payload_hex", () => {
    const res = parseEnveloppeGenerique({
      dev_eui: "abc123",
      payload_hex: "4620",
    });
    expect(estErreurEnveloppe(res)).toBe(false);
    if (estErreurEnveloppe(res)) return;
    expect(res.devEui).toBe("ABC123");
    expect(bytesToHex(res.payload)).toBe("4620");
  });

  it("accepte payload_base64", () => {
    const res = parseEnveloppeGenerique({
      dev_eui: "abc123",
      payload_base64: "RiA=",
    });
    expect(estErreurEnveloppe(res)).toBe(false);
    if (estErreurEnveloppe(res)) return;
    expect(bytesToHex(res.payload)).toBe("4620");
  });

  it("erreur si ni payload_hex ni payload_base64", () => {
    const res = parseEnveloppeGenerique({ dev_eui: "abc" });
    expect(estErreurEnveloppe(res)).toBe(true);
  });
});
