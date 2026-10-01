import type { NextConfig } from "next";
import { entetesSecurite } from "./src/lib/securite/entetes";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:chemin*",
        headers: entetesSecurite({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          developpement: process.env.NODE_ENV !== "production",
        }),
      },
    ];
  },
};

export default nextConfig;
