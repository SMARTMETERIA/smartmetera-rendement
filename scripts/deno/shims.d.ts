// Types minimaux de l'environnement Deno des fonctions Supabase, pour les
// vérifier avec le compilateur TypeScript du projet (npm run typecheck:fonctions).
declare module "jsr:@supabase/functions-js/edge-runtime.d.ts" {}
declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
declare const Deno: {
  env: { get(k: string): string | undefined; toObject(): Record<string, string> };
  serve(h: (req: Request) => Response | Promise<Response>): void;
};
