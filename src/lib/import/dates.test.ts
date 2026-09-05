import { describe, expect, it } from "vitest";
import { parseDate } from "./dates";

describe("parseDate", () => {
  it("parse ISO avec heure", () => {
    const d = parseDate("2026-06-01 12:00:00", "YYYY-MM-DD HH:mm:ss");
    expect(d?.toISOString()).toBe("2026-06-01T10:00:00.000Z"); // été : UTC+2
  });

  it("parse un format français jour/mois/année", () => {
    const d = parseDate("01/06/2026 12:00", "DD/MM/YYYY HH:mm");
    expect(d?.toISOString()).toBe("2026-06-01T10:00:00.000Z");
  });

  it("parse un format avec points (Diehl)", () => {
    const d = parseDate("01.06.2026 12:00", "DD.MM.YYYY HH:mm");
    expect(d?.toISOString()).toBe("2026-06-01T10:00:00.000Z");
  });

  it("gère le passage heure d'hiver (UTC+1)", () => {
    const d = parseDate("2026-01-15 12:00:00", "YYYY-MM-DD HH:mm:ss");
    expect(d?.toISOString()).toBe("2026-01-15T11:00:00.000Z");
  });

  it("retourne null pour une valeur qui ne correspond pas au format", () => {
    expect(parseDate("pas-une-date", "YYYY-MM-DD HH:mm:ss")).toBeNull();
    expect(parseDate("", "YYYY-MM-DD HH:mm:ss")).toBeNull();
  });

  it("retourne null pour un mois ou jour hors limites", () => {
    expect(parseDate("2026-13-01 00:00:00", "YYYY-MM-DD HH:mm:ss")).toBeNull();
    expect(parseDate("2026-02-32 00:00:00", "YYYY-MM-DD HH:mm:ss")).toBeNull();
  });
});
