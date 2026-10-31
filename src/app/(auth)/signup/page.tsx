"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock3, GraduationCap, Loader2, Presentation, UserPlus } from "lucide-react";
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
      setError(signUpError.message);
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
