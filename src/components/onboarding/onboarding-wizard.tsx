"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowRight, Check, GraduationCap, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/ui-bits";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface SchoolOption {
  id: string;
  name: string;
  short_name: string;
  country: string;
  max_years: number;
  current_academic_year: string;
  year_advance_at: string | null;
}

/**
 * Two-step onboarding: school → year (staff pick just the school).
 * Saving stamps `year_synced_at`, so the academic-year rollover only
 * ever moves you forward from here.
 */
export function OnboardingWizard({
  role,
  initialName,
  schools,
}: {
  role: string;
  initialName: string;
  schools: SchoolOption[];
}) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const school = schools.find((entry) => entry.id === schoolId) ?? null;
  const isStudent = role === "student";
  const years = school ? Array.from({ length: school.max_years }, (_, index) => index + 1) : [];

  const save = async () => {
    if (!supabase || !schoolId || (isStudent && !year)) return;
    setSaving(true);

    // Resolve the user first — updating with an empty id would silently
    // match nothing and surface as a baffling "try again" error.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setSaving(false);
      toast.error("Your session expired — please sign in again");
      router.push("/login?next=/onboarding");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        school_id: schoolId,
        year_of_study: isStudent ? year : null,
        year_synced_at: new Date().toISOString(),
        onboarding_done: true,
      })
      .eq("id", userId);

    setSaving(false);
    if (error) {
      toast.error("Couldn't save your setup — please try again");
      return;
    }
    toast.success(`Welcome aboard, ${initialName.split(" ")[0]}!`);
    router.push(isStudent ? "/dashboard" : "/lecturer");
    router.refresh();
  };

  if (schools.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap className="size-8" aria-hidden />}
        title="Almost ready"
        description="Your school hasn't been added to the platform yet. Ask your class rep or lecturer to get in touch with the platform team, then come back — your account is ready and waiting."
        action={
          <Button asChild variant="outline">
            <a href="/support">Contact support</a>
          </Button>
        }
      />
    );
  }

  return (
    <div className="glass-card p-6 sm:p-8">
      <div className="mb-6 text-center">
        <BrandLogo className="mx-auto size-12" rounded="rounded-2xl" />
        <h1 className="font-display mt-3 text-xl font-semibold tracking-tight">
          {isStudent ? "Where do you study?" : "Which school are you at?"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {isStudent
            ? "This tailors your dashboard to your year — you'll still see every other year's material."
            : "Your notes and analytics are scoped to your school."}
        </p>
      </div>

      {/* Step 1 — school */}
      <fieldset className="space-y-2">
        <legend className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
          Step 1 · Your school
        </legend>
        <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {schools.map((entry) => {
            const selected = entry.id === schoolId;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setSchoolId(entry.id);
                  setYear(null);
                }}
                aria-pressed={selected}
                className={`rounded-xl border p-3 text-left transition-all ${
                  selected
                    ? "border-primary bg-primary/10"
                    : "hover:border-primary/40 border-border bg-muted/20"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{entry.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {entry.short_name} · {entry.country}
                      {entry.current_academic_year ? ` · ${entry.current_academic_year}` : ""}
                    </span>
                  </span>
                  {selected ? <Check className="text-primary size-4 shrink-0" aria-hidden /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Step 2 — year */}
      {isStudent && school ? (
        <fieldset className="mt-6 space-y-2">
          <legend className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
            Step 2 · Year of study
          </legend>
          <div className="flex flex-wrap gap-2">
            {years.map((value) => {
              const selected = value === year;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setYear(value)}
                  aria-pressed={selected}
                  className={`min-w-16 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                    selected
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:border-primary/40 border-border bg-muted/20"
                  }`}
                >
                  Year {value}
                </button>
              );
            })}
          </div>
          {school.year_advance_at && school.current_academic_year ? (
            <p className="text-muted-foreground/80 mt-2 text-xs">
              {school.current_academic_year} rolls over on{" "}
              {format(new Date(school.year_advance_at), "d MMM yyyy")} — your year updates
              automatically from there.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <Button
        className="mt-8 w-full gap-2"
        disabled={!schoolId || (isStudent && !year) || saving}
        onClick={() => void save()}
      >
        {saving ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <ArrowRight className="size-4" aria-hidden />
        )}
        {saving ? "Saving…" : "Finish setup"}
      </Button>
    </div>
  );
}
