import { config } from "dotenv";
import path from "node:path";

// Les tests d'intégration parlent au vrai Supabase du projet : les clés
// viennent de .env.local, jamais chargé automatiquement en dehors de Next.js.
config({ path: path.resolve(import.meta.dirname, "../../../.env.local") });
