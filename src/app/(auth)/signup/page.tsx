"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, GraduationCap, Loader2, Mail, Presentation, UserPlus } from "lucide-react";
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

/**
 * Translate raw Supabase auth errors into guidance a new student can
 * act on. The mailer failure ("Error sending confirmation email") is a
 * server-side email configuration/limit issue, not something the user
 * did wrong — say so plainly instead of showing the raw string.
 */
function friendlySignupError(raw: string): string {
  const message = raw.toLowerCase();
  if (message.includes("sending confirmation email") || message.includes("error sending")) {
    return (
      "Your account was created, but the confirmation email could not be sent right now " +
      "(the email service is briefly unavailable or hit its sending limit). " +
      "Wait a minute, then tap “Resend confirmation email” below."
    );
  }
  if (message.includes("rate limit")) {
    return "Too many attempts in a short time — wait a few minutes and try again.";
  }
  if (message.includes("already registered") || message.includes("already exists")) {
    return "That email already has an account — sign in instead, or reset your password.";
  }
  if (message.includes("password")) {
    return "Password needs at least 8 characters.";
  }
  if (message.includes("invalid") && message.includes("email")) {
    return "That email address doesn't look valid — check it and try again.";
  }
  return raw;
}

/**
 * Sign-up with the same two doors as sign-in. Staff accounts are
 * created unactivated: the platform team reviews and activates them
 * from the operations console, and until then staff sign in to a
 * clear "awaiting activation" screen — no staff capability exists
 * before that (enforced in the database, not just the UI).
 */
export default function SignupPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [portal, setPortal] = useState<Portal>("student");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);

  /** Offered when the confirmation email failed to go out. */
  const resendConfirmation = async () => {
    if (!supabase) return;
    setResending(true);
    setError(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResending(false);
    if (resendError) {
      setError(
        resendError.message.toLowerCase().includes("rate limit")
          ? "The email service is rate-limiting us — wait a minute and try again."
          : `Still couldn't send the email: ${resendError.message}`,
      );
      return;
    }
    setShowResend(false);
    toast.success("Confirmation email sent", {
      description: `Check ${email} — the link expires after a while, so use it soon.`,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!supabase) {
      setError("Sign-up is temporarily unavailable — please try again shortly.");
      return;
    }

    setPending(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Consumed by the handle_new_user() database trigger — the
        // role is validated there; anything but "lecturer" → student.
        data: { full_name: fullName, role: portal },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setPending(false);
      setError(friendlySignupError(signUpError.message));
      // The mailer failure means the account EXISTS but has no way to
      // confirm — surface the resend action right here.
      if (
        signUpError.message.toLowerCase().includes("sending confirmation email") ||
        signUpError.message.toLowerCase().includes("error sending")
      ) {
        setShowResend(true);
      }
      return;
    }

    if (data.session) {
      // Email confirmation disabled — straight in.
      if (portal === "staff") {
        toast.success("Account created", {
          description: "The platform team will activate your staff access shortly.",
        });
        router.push("/pending-approval");
      } else {
        toast.success(`Welcome to BioChem, ${fullName.split(" ")[0]}!`);
        router.push("/onboarding");
      }
      router.refresh();
      return;
    }

    setPending(false);
    toast.success("Check your inbox", {
      description: "We sent a confirmation link to finish setting up your account.",
    });
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free forever. Built for your whole biochemistry class."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium underline underline-offset-4">
            Sign in
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

      {portal === "staff" ? (
        <div className="glass-card mb-5 flex items-start gap-3 border-sky-500/30 p-4">
          <Clock3 className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
          <p className="text-muted-foreground text-sm">
            Staff accounts are activated after a quick review by the platform team. You'll be able
            to sign in immediately, but publishing unlocks once your account is activated.
          </p>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            autoComplete="name"
            required
            minLength={2}
            placeholder={portal === "student" ? "Alex Mutiso" : "Dr. Wanjiku Kariuki"}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">University email</Label>
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
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            {portal === "student"
              ? "You can contribute notes, questions and flashcards right away."
              : "Your account will show as 'awaiting activation' until the team activates it."}
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}

        {showResend ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={resending || email.trim().length === 0}
            onClick={resendConfirmation}
          >
            {resending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Mail className="size-4" aria-hidden />
            )}
            {resending ? "Sending…" : "Resend confirmation email"}
          </Button>
        ) : null}

        <Button type="submit" className="w-full gap-2" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <UserPlus className="size-4" aria-hidden />
          )}
          {pending ? "Creating account…" : `Create ${portal} account`}
        </Button>
      </form>
    </AuthShell>
  );
}
