"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { jobSchema } from "@/lib/validation";
import { JOB_TYPE_META } from "@/components/jobs/job-card";

/**
 * Post-a-job dialog (lecturers + admins). Validates with the shared jobSchema
 * — closesAt is adapted from the native date input (YYYY-MM-DD) to an ISO
 * datetime on submit — and creates a *pending* posting via POST /api/jobs.
 */

const jobFormSchema = jobSchema.extend({
  closesAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .nullable()
    .optional(),
});

type JobFormInput = z.input<typeof jobFormSchema>;
type JobFormOutput = z.output<typeof jobFormSchema>;

const DEFAULT_VALUES: JobFormInput = {
  title: "",
  org: "",
  location: "",
  type: "internship",
  descriptionMd: "",
  contact: "",
  closesAt: null,
};

function fieldError(message: string | undefined): React.ReactNode {
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs font-medium">
      {message}
    </p>
  );
}

export function JobFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [pending, setPending] = useState(false);

  const form = useForm<JobFormInput, unknown, JobFormOutput>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: DEFAULT_VALUES,
  });
  const errors = form.formState.errors;

  // Fresh form each time the dialog opens.
  useEffect(() => {
    if (open) form.reset(DEFAULT_VALUES);
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values: JobFormOutput) => {
    setPending(true);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          org: values.org,
          location: values.location,
          type: values.type,
          descriptionMd: values.descriptionMd,
          contact: values.contact,
          closesAt: values.closesAt ? new Date(values.closesAt).toISOString() : null,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Couldn't submit the posting";
        toast.error(message);
        return;
      }
      toast.success("Submitted — an admin will review the posting");
      onCreated();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't submit the posting — check your connection and try again");
    } finally {
      setPending(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" className="focus-ring">
          <Plus className="size-4" aria-hidden />
          Post a job
        </Button>
      </DialogTrigger>
      <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Post a position</DialogTitle>
          <DialogDescription>
            Internships, attachment opportunities and graduate roles for biochemistry students.
            Postings go live after a quick admin review.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-title">Role title</Label>
              <Input
                id="job-title"
                placeholder="e.g. Lab intern — enzymology"
                {...form.register("title")}
              />
              {fieldError(errors.title?.message)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-org">Organisation</Label>
              <Input id="job-org" placeholder="e.g. Nairobi Water Lab" {...form.register("org")} />
              {fieldError(errors.org?.message)}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-location">Location</Label>
              <Input
                id="job-location"
                placeholder="e.g. Nairobi (on-site)"
                {...form.register("location")}
              />
              {fieldError(errors.location?.message)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-type">Type</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="job-type" className="w-full" aria-label="Job type">
                      <SelectValue placeholder="Choose a type" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(JOB_TYPE_META) as Array<keyof typeof JOB_TYPE_META>).map(
                        (type) => (
                          <SelectItem key={type} value={type}>
                            {JOB_TYPE_META[type].label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              {fieldError(errors.type?.message)}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="job-description">Description</Label>
            <Textarea
              id="job-description"
              placeholder={
                "Describe the role, requirements and what students will gain…\n\n## Responsibilities\n- …"
              }
              className="min-h-40 font-mono text-sm"
              {...form.register("descriptionMd")}
            />
            <p className="text-muted-foreground text-xs">
              Markdown supported (headings, lists, <span className="font-mono">$LaTeX$</span>) —
              keep it under 10,000 characters.
            </p>
            {fieldError(errors.descriptionMd?.message)}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="job-contact">Contact</Label>
              <Input
                id="job-contact"
                placeholder="Email or link students should use"
                {...form.register("contact")}
              />
              {fieldError(errors.contact?.message)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="job-closes">Closes on (optional)</Label>
              <Input
                id="job-closes"
                type="date"
                {...form.register("closesAt", {
                  setValueAs: (value: string) => (value === "" ? null : value),
                })}
              />
              {fieldError(errors.closesAt?.message)}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="focus-ring"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="focus-ring">
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Submitting…" : "Submit for review"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
