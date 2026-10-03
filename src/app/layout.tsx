import type { Metadata } from "next";
import { Fraunces, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { NOM_PRODUIT } from "@/lib/marque";

// Identité SmartMeteria (docs/DESIGN.md) : Fraunces pour les titres et les
// grands chiffres, Manrope pour le texte. Polices auto-hébergées par Next.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Titre de l'application ; une page de partenaire impose le sien (absolute).
  title: { default: NOM_PRODUIT, template: `%s — ${NOM_PRODUIT}` },
  description:
    "Le registre eau des établissements : fuites détectées la nuit, températures d'eau chaude, économies prouvées.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${manrope.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
