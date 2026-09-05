import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DevAutoLogin } from "@/components/DevAutoLogin";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SmartMeteria Rendement",
  description:
    "Bilan d'eau, rendement de réseau et localisation des fuites pour les services d'eau potable.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <DevAutoLogin />
        {children}
      </body>
    </html>
  );
}
