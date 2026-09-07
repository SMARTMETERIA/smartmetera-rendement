import { describe, it, expect } from "vitest";
import { extraireToken } from "./token";

describe("extraireToken", () => {
  it("adressage par domaine dédié : la local-part entière est le jeton", () => {
    expect(extraireToken("ab12cd34@import.smartmeteria.fr")).toBe("ab12cd34");
  });

  it("adressage plus-addressing Postmark : le suffixe après + est le jeton", () => {
    expect(extraireToken("a1b2c3+ab12cd34@inbound.postmarkapp.com")).toBe("ab12cd34");
  });

  it("gère une adresse avec nom affiché", () => {
    expect(extraireToken("Régie <ab12cd34@import.smartmeteria.fr>")).toBe("ab12cd34");
  });

  it("normalise en minuscules", () => {
    expect(extraireToken("AB12CD34@import.smartmeteria.fr")).toBe("ab12cd34");
  });

  it("retourne null si aucune adresse reconnaissable", () => {
    expect(extraireToken("pas une adresse")).toBeNull();
  });
});
