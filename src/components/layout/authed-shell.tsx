"use client";

import type { ReactNode } from "react";
import { UserProvider } from "@/hooks/use-user";
import { AppShell } from "@/components/layout/app-shell";
import type { Database } from "@/types/domain";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Client wrapper for authenticated pages: seeds the user context with the
 * profile fetched server-side (no loading flash), then renders the shell.
 */
export function AuthedShell({ profile, children }: { profile: Profile; children: ReactNode }) {
  return (
    <UserProvider initialProfile={profile}>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
