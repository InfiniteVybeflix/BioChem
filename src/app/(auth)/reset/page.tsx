"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, MailCheck, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/layout/auth-shell";
import { SetupNotice } from "@/components/common/setup-notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

export default function ResetPage() {
  const supabase = getSupabaseBrowserClient();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Password reset is temporarily unavailable — please contact support.");
      return;
    }

    setPending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });
    setPending(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure link to set a new one."
      footer={
        <Link href="/login" className="text-primary font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      {!isSupabaseConfigured() ? (
        <div className="mb-5">
          <SetupNotice missing="app" />
        </div>
      ) : null}

      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl">
            <MailCheck className="size-6" aria-hidden />
          </span>
          <p className="font-medium">Check your inbox</p>
          <p className="text-muted-foreground text-sm">
            If an account exists for <span className="text-foreground font-medium">{email}</span>, a
            reset link is on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@university.ac.ke"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              <SendHorizontal className="size-4" aria-hidden />
            )}
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
