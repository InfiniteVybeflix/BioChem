"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console sign-in. The only credentials that work are the ones in the
 * deployment's environment variables — there is no account to create,
 * no password reset, and no fallback. Five bad attempts lock this IP
 * out for 15 minutes.
 */
export function ConsoleSignIn() {
  const router = useRouter();
  const base = useConsoleBase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch(consoleUrl(base, "api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Sign-in failed");
        return;
      }
      router.replace(`${base}/dashboard`);
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="glass-card mx-auto flex size-14 items-center justify-center rounded-2xl">
            <FlaskConical className="text-primary size-7" aria-hidden />
          </span>
          <h1 className="font-display mt-4 text-xl font-semibold tracking-tight">
            Operations console
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Authorised personnel only. All activity is logged.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-4 p-6">
          <div className="space-y-2">
            <Label htmlFor="console-email">Email</Label>
            <Input
              id="console-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="console-password">Password</Label>
            <Input
              id="console-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
            >
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full gap-2" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LockKeyhole className="size-4" aria-hidden />
            )}
            {pending ? "Verifying…" : "Unlock console"}
          </Button>
        </form>

        <p className="text-muted-foreground/50 mt-6 text-center text-xs">
          BioChem — built by Aevibron
        </p>
      </div>
    </div>
  );
}
