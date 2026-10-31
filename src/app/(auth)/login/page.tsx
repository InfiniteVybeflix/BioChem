"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, Loader2, LogIn, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AuthShell } from "@/components/layout/auth-shell";
import { SetupNotice } from "@/components/common/setup-notice";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { toast } from "sonner";

type Portal = "student" | "staff";

interface ProfileLite {
  role: "student" | "lecturer" | "admin";
  suspended: boolean;
  approved: boolean;
  onboarding_done: boolean;
}

/**
 * Role-based sign-in. The tab you pick is the door you walk through:
 * students land on their personalised dashboard, staff land in the
 * lecturer workspace. Credentials of one kind are politely refused at
 * the other door — and accounts awaiting activation or suspended are
 * routed to the right screen with a clear message.
 */
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();
  const [portal, setPortal] = useState<Portal>("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = searchParams.get("next") ?? "";

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    // Show recovery / email-confirm messages coming back from emails.
    const message = searchParams.get("message");
    if (message) toast.info(message);
  }, [searchParams]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Sign-in is temporarily unavailable — please try again shortly.");
      return;
    }

    setPending(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setPending(false);
      setError(
        signInError.message === "Invalid login credentials"
          ? "That email and password combination doesn't match. Try again or reset your password."
          : signInError.message,
      );
      return;
    }

    // Fetch the profile to route by role (defence in depth: the server
    // layout re-checks everything on the next request anyway).
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, suspended, approved, onboarding_done")
      .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle<ProfileLite>();

    const role = profile?.role ?? "student";

    if (profile?.suspended) {
      await supabase.auth.signOut();
      setPending(false);
      setError(
        "This account has been suspended. If you believe that's a mistake, contact support from the link below.",
      );
      return;
    }

    if (portal === "student" && role === "lecturer") {
      await supabase.auth.signOut();
      setPending(false);
      setError("This is a staff account — switch to the Staff tab to sign in.");
      return;
    }

    if (portal === "staff" && role === "student") {
      await supabase.auth.signOut();
      setPending(false);
      setError("This is a student account — switch to the Student tab to sign in.");
      return;
    }

    toast.success("Welcome back!");

    if (role === "lecturer") {
      if (!profile?.approved) {
        router.push("/pending-approval");
      } else {
        router.push(next && next !== "/dashboard" ? next : "/lecturer");
      }
    } else {
      const fallback = profile?.onboarding_done ? "/dashboard" : "/onboarding";
      router.push(next || fallback);
    }
    router.refresh();
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Pick your door — each one leads where you're supposed to be."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className="text-primary font-medium underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      {!isSupabaseConfigured() ? (
        <div className="mb-5">
          <SetupNotice missing="app" />
        </div>
      ) : null}

      <Tabs value={portal} onValueChange={(value) => setPortal(value as Portal)} className="mb-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="student" className="gap-2">
            <GraduationCap className="size-4" aria-hidden />
            Student
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-2">
            <Presentation className="size-4" aria-hidden />
            Staff
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            placeholder={portal === "student" ? "you@university.ac.ke" : "staff@university.ac.ke"}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/reset" className="text-primary text-xs underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="••••••••"
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
            <LogIn className="size-4" aria-hidden />
          )}
          {pending ? "Signing in…" : `Sign in as ${portal === "student" ? "student" : "staff"}`}
        </Button>
      </form>
    </AuthShell>
  );
}

/**
 * useSearchParams() requires a Suspense boundary for static prerendering —
 * the shell renders instantly while the form (which reads ?next=) hydrates.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
