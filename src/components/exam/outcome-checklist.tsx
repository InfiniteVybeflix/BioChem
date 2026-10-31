"use client";

import { useCallback, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/hooks/use-user";
import { xpFor } from "@/lib/xp";

export interface OutcomeLite {
  id: string;
  code: string;
  statement: string;
}

export type MasteredMap = Record<string, boolean>;

/**
 * Shared outcome-toggle logic: optimistic upsert into user_outcome_progress,
 * +XP (and a toast) the first time an outcome is mastered, sign-in prompt for
 * guests. Reused by the note checklist and the outcomes matrix.
 */
export function useOutcomeToggles(initialMastered: MasteredMap) {
  const { supabase, userId } = useUser();
  const [mastered, setMastered] = useState<MasteredMap>(initialMastered);

  const toggle = useCallback(
    async (outcomeId: string, next: boolean) => {
      if (!userId || !supabase) {
        toast.error("Sign in to track your outcome mastery", {
          action: {
            label: "Sign in",
            onClick: () => {
              window.location.assign("/login");
            },
          },
        });
        return;
      }

      const previous = mastered[outcomeId] ?? false;
      setMastered((map) => ({ ...map, [outcomeId]: next }));

      const { error } = await supabase
        .from("user_outcome_progress")
        .upsert(
          { user_id: userId, outcome_id: outcomeId, mastered: next },
          { onConflict: "user_id,outcome_id" },
        );

      if (error) {
        setMastered((map) => ({ ...map, [outcomeId]: previous }));
        toast.error("Couldn't save your progress", { description: error.message });
        return;
      }

      if (next && !previous) {
        const amount = xpFor("outcome_mastered");
        const { error: xpError } = await supabase.rpc("award_xp", {
          p_amount: amount,
          p_reason: "outcome_mastered",
        });
        if (!xpError)
          toast.success(`+${amount} XP`, { description: "Outcome mastered — keep going!" });
      }
    },
    [mastered, supabase, userId],
  );

  return { mastered, toggle };
}

/** One outcome row: checkbox + code + statement (44px touch target). */
export function OutcomeRow({
  outcome,
  mastered,
  onToggle,
}: {
  outcome: OutcomeLite;
  mastered: boolean;
  onToggle: (outcomeId: string, next: boolean) => void;
}) {
  return (
    <li>
      <label className="hover:bg-accent/50 focus-within:ring-ring/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors focus-within:ring-2">
        <Checkbox
          checked={mastered}
          onCheckedChange={(value) => onToggle(outcome.id, value === true)}
          className="mt-0.5"
          aria-label={`${outcome.code}: ${outcome.statement}`}
        />
        <span className="min-w-0 text-sm leading-6">
          <span className="text-primary mr-1.5 font-mono text-xs font-bold">{outcome.code}</span>
          <span className="text-foreground/90">{outcome.statement}</span>
        </span>
      </label>
    </li>
  );
}

/**
 * Topic outcomes checklist for the note viewer: header with "x of y mastered",
 * progress bar and a scrollable checkbox list. Collapsible so it works as a
 * right column on desktop and a compact section on mobile.
 */
export function OutcomeChecklist({
  outcomes,
  initialMastered,
}: {
  outcomes: OutcomeLite[];
  initialMastered: MasteredMap;
}) {
  const { mastered, toggle } = useOutcomeToggles(initialMastered);
  const masteredCount = outcomes.filter((outcome) => mastered[outcome.id]).length;
  const pct = outcomes.length > 0 ? Math.round((masteredCount / outcomes.length) * 100) : 0;

  if (outcomes.length === 0) {
    return (
      <div className="glass-card text-muted-foreground p-4 text-sm sm:p-5">
        <p className="text-foreground flex items-center gap-2 font-medium">
          <ListChecks className="text-primary size-4" aria-hidden />
          Outcomes checklist
        </p>
        <p className="mt-1.5">No outcomes have been mapped to this topic yet.</p>
      </div>
    );
  }

  return (
    <Collapsible defaultOpen className="glass-card p-4 sm:p-5">
      <CollapsibleTrigger className="group focus-ring flex w-full items-center justify-between gap-3 rounded-lg text-left">
        <div>
          <p className="text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <ListChecks className="text-primary size-3.5" aria-hidden />
            Outcomes checklist
          </p>
          <p className="font-heading mt-0.5 text-base font-semibold">
            <span className="tabular-nums">{masteredCount}</span> of{" "}
            <span className="tabular-nums">{outcomes.length}</span> mastered
          </p>
        </div>
        <ChevronDown
          className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <Progress value={pct} className="mt-3" aria-label={`${pct}% of outcomes mastered`} />
      <CollapsibleContent>
        <ul className="scrollbar-slim mt-3 max-h-96 space-y-0.5 overflow-y-auto">
          {outcomes.map((outcome) => (
            <OutcomeRow
              key={outcome.id}
              outcome={outcome}
              mastered={mastered[outcome.id] ?? false}
              onToggle={toggle}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
