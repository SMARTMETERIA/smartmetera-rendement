import { describe, it, expect } from "vitest";
import { construireEmailInvitation } from "./invitationEmail";

describe("construireEmailInvitation", () => {
  it("inclut le nom de l'organisation, le role et le lien d'invitation", () => {
    const rendu = construireEmailInvitation(
      "Régie des Sources",
      "admin_client",
      "https://exemple.supabase.co/auth/v1/verify?token=abc",
      "https://app.smartmeteria.test",
    );
    expect(rendu.subject).toBe("[SmartMeteria] Invitation — Régie des Sources");
    expect(rendu.html).toContain("administrateur");
    expect(rendu.html).toContain("https://exemple.supabase.co/auth/v1/verify?token=abc");
    expect(rendu.text).toContain("https://exemple.supabase.co/auth/v1/verify?token=abc");
  });
});
