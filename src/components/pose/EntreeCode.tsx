"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Saisie du code de l'étiquette (si le QR code ne se scanne pas). */
export function EntreeCode() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const propre = code.trim().replace(/\s+/g, "");
        if (propre) router.push(`/pose/${encodeURIComponent(propre)}`);
      }}
    >
      <Label htmlFor="code">Code de l&apos;étiquette, IMEI ou DevEUI</Label>
      <Input
        id="code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        autoCapitalize="characters"
        autoComplete="off"
        className="h-14 text-lg uppercase"
      />
      <Button
        type="submit"
        className="h-14 w-full text-lg"
        disabled={!code.trim()}
      >
        Commencer la pose
      </Button>
    </form>
  );
}
