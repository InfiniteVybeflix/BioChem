"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/** Ends the console session (clears the signed cookie). */
export function ConsoleSignOutButton() {
  const router = useRouter();
  const base = useConsoleBase();

  const signOut = async () => {
    await fetch(consoleUrl(base, "api/session"), { method: "DELETE" }).catch(() => undefined);
    router.replace("/");
    router.refresh();
  };

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={() => void signOut()}>
      <LogOut className="size-4" aria-hidden />
      Lock console
    </Button>
  );
}
