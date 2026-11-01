"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SetupNotice } from "@/components/common/setup-notice";
import { useUser } from "@/hooks/use-user";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Change-password form for signed-in users. This is where the password-reset
 * email link lands (reset flow → /auth/callback → /settings), and where any
 * signed-in user can rotate their password at any time.
 */
export function PasswordForm() {
  const { supabase } = useUser();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);

  if (!supabase) {
    return <SetupNotice missing="app" compact />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords don't match");
      return;
    }

    setPending(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error("Couldn't update your password", { description: error.message });
        return;
      }
      toast.success("Password updated", {
        description: "Use your new password the next time you sign in.",
      });
      setPassword("");
      setConfirm("");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="text-primary size-4" aria-hidden />
          Password
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Followed a reset link from your email? Set your new password right here.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password-new">New password</Label>
        <div className="relative max-w-md">
          <Input
            id="password-new"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShow((value) => !value)}
            aria-label={show ? "Hide passwords" : "Show passwords"}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password-confirm">Confirm new password</Label>
        <Input
          id="password-confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          placeholder="Type the same password again"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="max-w-md"
        />
      </div>

      <Button type="submit" className="focus-ring" disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
