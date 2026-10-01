import { describe, expect, it } from "vitest";
import { messageBase } from "./base";

const G = "Action impossible. Réessayez.";

describe("messages d'erreur de la base", () => {
  it("garde les messages de nos fonctions SQL, en français", () => {
    expect(messageBase({ code: "42501", message: "Site introuvable ou rôle insuffisant." }, G)).toBe(
      "Site introuvable ou rôle insuffisant.",
    );
    expect(messageBase({ code: "P0001", message: "Liste d'appareils invalide (2000 au plus)." }, G)).toBe(
      "Liste d'appareils invalide (2000 au plus).",
    );
  });

  it("remplace les erreurs techniques en anglais", () => {
    expect(messageBase({ code: "42501", message: 'new row violates row-level security policy for table "meters"' }, G)).toBe(G);
    expect(messageBase({ code: "23505", message: 'duplicate key value violates unique constraint "x"' }, G)).toBe(G);
    expect(messageBase({ code: "22P02", message: 'invalid input syntax for type uuid: "abc"' }, G)).toBe(G);
    expect(messageBase({ code: "P0001", message: "Unexpected failure" }, G)).toBe(G);
    expect(messageBase(null, G)).toBe(G);
    expect(messageBase({ code: "P0001", message: "" }, G)).toBe(G);
  });
});
