import { describe, expect, it, vi } from "vitest";
import { configEnvois, notify, type Message } from "./notify";
import { canauxDisponibles, configTelephone, twimlAppel, variablesWhatsapp } from "./telephone";

const SID = `AC${"0123456789abcdef".repeat(2)}`;
const TWILIO = {
  GARDIEN_TELEPHONE_FOURNISSEUR: "twilio",
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: "secret",
  TWILIO_SMS_FROM: "+33700000000",
  TWILIO_APPEL_FROM: "+33100000000",
  TWILIO_WHATSAPP_FROM: "+212500000000",
  TWILIO_WHATSAPP_CONTENT_SID: "HX0123",
};
const RESEND = { RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "alertes@exemple.fr" };

const sms: Message = {
  canal: "sms",
  destinataire: "+33612345678",
  sujet: null,
  texte: "SmartMeteria : fuite à l'Hôtel du Port.",
  html: null,
  expediteur: null,
  repondreA: null,
};

type Appel = [string, RequestInit];
const reponseTwilio = (status = 201, corps: unknown = { sid: "SM123" }) =>
  vi.fn<(...a: Appel) => Promise<Response>>(async () => new Response(JSON.stringify(corps), { status }));
const formulaire = (init: RequestInit) => new URLSearchParams(init.body as string);

describe("configuration du fournisseur de téléphone", () => {
  it("désactivé sans fournisseur choisi ou sans clés valides", () => {
    expect(configTelephone({})).toBeNull();
    expect(configTelephone({ ...TWILIO, GARDIEN_TELEPHONE_FOURNISSEUR: "" })).toBeNull();
    expect(configTelephone({ ...TWILIO, GARDIEN_TELEPHONE_FOURNISSEUR: "autre" })).toBeNull();
    expect(configTelephone({ ...TWILIO, TWILIO_AUTH_TOKEN: " " })).toBeNull();
    expect(configTelephone({ ...TWILIO, TWILIO_ACCOUNT_SID: "pas-un-compte" })).toBeNull();
  });

  it("chaque canal n'est actif qu'avec son numéro (et son modèle pour WhatsApp)", () => {
    expect(canauxDisponibles(null)).toEqual({ sms: false, appel: false, whatsapp: false });
    expect(canauxDisponibles(configTelephone(TWILIO))).toEqual({ sms: true, appel: true, whatsapp: true });
    expect(
      canauxDisponibles(
        configTelephone({ ...TWILIO, TWILIO_SMS_FROM: "", TWILIO_APPEL_FROM: "", TWILIO_WHATSAPP_CONTENT_SID: "" }),
      ),
    ).toEqual({ sms: false, appel: false, whatsapp: false });
    expect(
      canauxDisponibles(configTelephone({ ...TWILIO, TWILIO_SMS_FROM: "", TWILIO_MESSAGING_SERVICE_SID: "MG1" })).sms,
    ).toBe(true);
  });

  it("n'accepte qu'une adresse d'API Twilio", () => {
    expect(configTelephone({ ...TWILIO, TWILIO_API_BASE: "https://api.dublin.ie1.twilio.com" })?.apiBase).toBe(
      "https://api.dublin.ie1.twilio.com",
    );
    expect(configTelephone({ ...TWILIO, TWILIO_API_BASE: "https://pirate.example.com" })?.apiBase).toBe(
      "https://api.twilio.com",
    );
  });
});

describe("notify : SMS, appel et WhatsApp", () => {
  it("journal : rien ne part, même avec toutes les clés", async () => {
    const recuperer = reponseTwilio();
    const r = await notify(sms, configEnvois({ ...TWILIO, ...RESEND }), recuperer);
    expect(r).toMatchObject({ mode: "journal", statut: "journalise", erreur: null });
    expect(recuperer).not.toHaveBeenCalled();
  });

  it("réel sans clés Twilio : journalisé avec la raison", async () => {
    const recuperer = reponseTwilio();
    const r = await notify(sms, configEnvois({ ...RESEND, GARDIEN_ENVOIS_MODE: "reel" }), recuperer);
    expect(r).toMatchObject({ mode: "journal", statut: "journalise" });
    expect(r.erreur).toContain("Twilio n'est pas configuré");
    expect(recuperer).not.toHaveBeenCalled();
  });

  it("réel : SMS envoyé par Twilio, authentifié, au bon numéro", async () => {
    const recuperer = reponseTwilio();
    const r = await notify(sms, configEnvois({ ...TWILIO, ...RESEND, GARDIEN_ENVOIS_MODE: "reel" }), recuperer);
    expect(r).toEqual({ mode: "reel", statut: "envoye", fournisseur: "twilio", fournisseurId: "SM123", erreur: null });
    const [url, init] = recuperer.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa(`${SID}:secret`)}`);
    expect(Object.fromEntries(formulaire(init))).toEqual({
      To: "+33612345678",
      From: "+33700000000",
      Body: sms.texte,
    });
  });

  it("réel : l'appel lit le message en français, deux fois, caractères échappés", async () => {
    const recuperer = reponseTwilio(201, { sid: "CA9" });
    const config = configEnvois({ ...TWILIO, ...RESEND, GARDIEN_ENVOIS_MODE: "reel" });
    const r = await notify({ ...sms, canal: "appel", texte: "Fuite <cuisine> & bar" }, config, recuperer);
    expect(r.fournisseurId).toBe("CA9");
    const [url, init] = recuperer.mock.calls[0];
    expect(url).toMatch(/\/Calls\.json$/);
    const twiml = formulaire(init).get("Twiml") as string;
    expect(twiml).toBe(twimlAppel("Fuite <cuisine> & bar"));
    expect(twiml).toContain('<Say language="fr-FR">Fuite &lt;cuisine&gt; &amp; bar</Say>');
    expect(twiml.match(/<Say/g)).toHaveLength(2);
    expect(formulaire(init).get("From")).toBe("+33100000000");
  });

  it("réel : WhatsApp par modèle validé, texte sur une ligne", async () => {
    const recuperer = reponseTwilio();
    const config = configEnvois({ ...TWILIO, ...RESEND, GARDIEN_ENVOIS_MODE: "reel" });
    await notify({ ...sms, canal: "whatsapp", destinataire: "+212612345678", texte: "Fuite\n\nRiad   Atlas" }, config, recuperer);
    const corps = formulaire(recuperer.mock.calls[0][1]);
    expect(corps.get("To")).toBe("whatsapp:+212612345678");
    expect(corps.get("From")).toBe("whatsapp:+212500000000");
    expect(corps.get("ContentSid")).toBe("HX0123");
    expect(JSON.parse(corps.get("ContentVariables") as string)).toEqual({ "1": "Fuite · Riad Atlas" });
    expect(corps.has("Body")).toBe(false);
    expect(variablesWhatsapp("a".repeat(2000))).toHaveLength('{"1":""}'.length + 900);
  });

  it("redirection : tout part vers le numéro de test, sinon rien", async () => {
    const recuperer = reponseTwilio();
    const avecNumero = configEnvois({
      ...TWILIO,
      ...RESEND,
      GARDIEN_ENVOIS_MODE: "redirection",
      GARDIEN_EMAIL_REDIRECT: "test@exemple.fr",
      GARDIEN_TELEPHONE_REDIRECT: "+33 6 00 00 00 01",
    });
    const r = await notify(sms, avecNumero, recuperer);
    expect(r).toMatchObject({ mode: "redirection", statut: "envoye" });
    const corps = formulaire(recuperer.mock.calls[0][1]);
    expect(corps.get("To")).toBe("+33600000001");
    expect(corps.get("Body")).toBe(`[Test, pour +33612345678] ${sms.texte}`);

    const sansNumero = configEnvois({ ...TWILIO, ...RESEND, GARDIEN_ENVOIS_MODE: "redirection", GARDIEN_EMAIL_REDIRECT: "test@exemple.fr" });
    const r2 = await notify(sms, sansNumero, recuperer);
    expect(r2).toMatchObject({ statut: "journalise" });
    expect(r2.erreur).toContain("GARDIEN_TELEPHONE_REDIRECT");
    expect(recuperer).toHaveBeenCalledTimes(1);
  });

  it("échec signalé sans exception (refus de Twilio, réseau, numéro invalide)", async () => {
    const config = configEnvois({ ...TWILIO, ...RESEND, GARDIEN_ENVOIS_MODE: "reel" });
    const refus = reponseTwilio(400, { code: 21211, message: "Invalid 'To' Phone Number" });
    expect(await notify(sms, config, refus)).toMatchObject({
      statut: "echec",
      fournisseur: "twilio",
      erreur: "Twilio a répondu 400 (21211 Invalid 'To' Phone Number).",
    });
    const panne = vi.fn<(...a: Appel) => Promise<Response>>(async () => {
      throw new Error("réseau coupé");
    });
    expect(await notify(sms, config, panne)).toMatchObject({ statut: "echec", erreur: "réseau coupé" });
    const jamais = reponseTwilio();
    const r = await notify({ ...sms, destinataire: "0612345678" }, config, jamais);
    expect(r).toMatchObject({ statut: "echec" });
    expect(r.erreur).toContain("format international");
    expect(jamais).not.toHaveBeenCalled();
  });
});
