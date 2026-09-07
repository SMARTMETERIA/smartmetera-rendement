import { describe, it, expect } from "vitest";
import { construireCleIdempotence } from "./idempotency";

describe("construireCleIdempotence", () => {
  it("utilise fCnt en priorité quand disponible", () => {
    const cle = construireCleIdempotence({
      devEui: "ABC",
      canal: "A",
      fCnt: 12,
      horodatage: "2026-09-07T10:00:00.000Z",
    });
    expect(cle).toBe("ABC:A:fcnt:12");
  });

  it("retombe sur l'horodatage si fCnt absent", () => {
    const cle = construireCleIdempotence({
      devEui: "ABC",
      canal: null,
      horodatage: "2026-09-07T10:00:00.000Z",
    });
    expect(cle).toBe("ABC:-:ts:2026-09-07T10:00:00.000Z");
  });

  it("deux trames identiques produisent la même clé", () => {
    const a = construireCleIdempotence({
      devEui: "ABC",
      canal: "B",
      fCnt: 5,
      horodatage: "t1",
    });
    const b = construireCleIdempotence({
      devEui: "ABC",
      canal: "B",
      fCnt: 5,
      horodatage: "t1",
    });
    expect(a).toBe(b);
  });
});
