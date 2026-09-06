"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = [
  { value: "superadmin", label: "Superadmin" },
  { value: "admin_client", label: "Admin client" },
  { value: "agent", label: "Agent" },
  { value: "lecteur", label: "Lecteur" },
] as const;

export function RoleSelect({
  membershipId,
  roleActuel,
}: {
  membershipId: string;
  roleActuel: string;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);

  async function onChange(role: string) {
    setEnCours(true);
    const supabase = createClient();
    await supabase.from("memberships").update({ role }).eq("id", membershipId);
    setEnCours(false);
    router.refresh();
  }

  return (
    <Select
      value={roleActuel}
      onValueChange={(v) => v && onChange(v)}
      disabled={enCours}
    >
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
