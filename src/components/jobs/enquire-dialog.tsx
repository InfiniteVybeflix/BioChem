"use client";

import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/use-user";
import { enquirySchema } from "@/lib/validation";
import type { BoardJob } from "@/components/jobs/job-card";

/**
 * Enquiry dialog for students: prefilled with a polite template naming the
 * signed-in student, the role and the organisation, fully editable. Sends via
 * POST /api/jobs/[id]/enquire.
 */
export function EnquireDialog({
  job,
  onClose,
  onSent,
}: {
  job: BoardJob | null;
  onClose: () => void;
  onSent: (jobId: string) => void;
}) {
  const { profile } = useUser();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Rebuild the template each time a dialog opens for a different job.
  useEffect(() => {
    if (!job) return;
    const fullName = profile?.full_name?.trim() || "a biochemistry student";
    setMessage(
      `Hello, I'm ${fullName}, a biochemistry student. I'm interested in the ${job.title} role at ${job.org}. Could we discuss this opportunity?`,
    );
    setError(null);
  }, [job, profile]);

  if (!job) return null;

  const submit = async () => {
    const parsed = enquirySchema.safeParse({ message });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Introduce yourself briefly");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/enquire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: parsed.data.message }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Couldn't send your enquiry";
        toast.error(message);
        return;
      }
      toast.success("Enquiry sent — the poster will see your message");
      onSent(job.id);
      onClose();
    } catch {
      toast.error("Couldn't send your enquiry — check your connection and try again");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enquire — {job.title}</DialogTitle>
          <DialogDescription>
            Your message goes to {job.postedByName} at {job.org}. Introduce yourself, mention your
            year and what draws you to the role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="enquiry-message">Message</Label>
          <Textarea
            id="enquiry-message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (error) setError(null);
            }}
            className="min-h-36"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "enquiry-error" : undefined}
          />
          {error ? (
            <p id="enquiry-error" role="alert" className="text-destructive text-xs font-medium">
              {error}
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">10–2000 characters · editable template</p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={pending}
            className="focus-ring"
          >
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending} className="focus-ring">
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {pending ? "Sending…" : "Send enquiry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
