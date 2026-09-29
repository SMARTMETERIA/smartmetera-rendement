import { describe, expect, it } from "vitest";
import { choisirModeEnvoi, formaterExpediteur } from "./envoyer";

describe("mode d'envoi des e-mails", () => {
  const cles = {
    RESEND_API_KEY: "re_x",
    RESEND_FROM_EMAIL: "alertes@exemple.fr",
  };

  it("n'envoie jamais à un vrai destinataire en développement", () => {
    expect(choisirModeEnvoi({ NODE_ENV: "development" })).toBe("journal");
    expect(choisirModeEnvoi({ NODE_ENV: "development", ...cles })).toBe(
      "journal",
    );
    expect(choisirModeEnvoi({ NODE_ENV: "test", ...cles })).toBe("journal");
  });

  it("redirige vers l'adresse de test si elle est donnée", () => {
    expect(
      choisirModeEnvoi({
        NODE_ENV: "development",
        ...cles,
        EMAIL_DEV_REDIRECT: "test@exemple.fr",
      }),
    ).toBe("redirection");
  });

  it("utilise Resend en production, et refuse sans clés", () => {
    expect(choisirModeEnvoi({ NODE_ENV: "production", ...cles })).toBe(
      "resend",
    );
    expect(choisirModeEnvoi({ NODE_ENV: "production" })).toBe("indisponible");
    expect(
      choisirModeEnvoi({
        NODE_ENV: "production",
        EMAIL_DEV_REDIRECT: "t@e.fr",
      }),
    ).toBe("indisponible");
  });
});

describe("expéditeur", () => {
  it("met le nom du partenaire devant l'adresse de la plateforme", () => {
    expect(
      formaterExpediteur("Camping Pro", "SmartMeteria <releves@exemple.fr>"),
    ).toBe('"Camping Pro" <releves@exemple.fr>');
  });

  it("garde l'expéditeur de la plateforme sans nom", () => {
    expect(
      formaterExpediteur(undefined, "SmartMeteria <releves@exemple.fr>"),
    ).toBe("SmartMeteria <releves@exemple.fr>");
  });

  it("neutralise les caractères qui cassent l'en-tête", () => {
    expect(
      formaterExpediteur('Pi"rate <x>\r\nBcc: a@b.c', "releves@exemple.fr"),
    ).toBe('"Pirate xBcc: a@b.c" <releves@exemple.fr>');
  });
});
