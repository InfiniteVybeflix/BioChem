"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Filter, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  OutcomeRow,
  useOutcomeToggles,
  type MasteredMap,
} from "@/components/exam/outcome-checklist";
import { ZONES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ExamZone } from "@/types/domain";

export interface MatrixTopic {
  id: string;
  title: string;
  slug: string;
  zone: ExamZone;
  orderIndex: number;
}

export interface MatrixOutcome {
  id: string;
  code: string;
  statement: string;
  topicId: string;
  orderIndex: number;
}

function pct(mastered: number, total: number): number {
  return total > 0 ? Math.round((mastered / total) * 100) : 0;
}

/**
 * Full outcomes matrix grouped by zone → topic, with per-topic and per-zone
 * progress bars, an overall mastery stat, and an "unmastered only" filter.
 */
export function OutcomesMatrix({
  topics,
  outcomes,
  initialMastered,
}: {
  topics: MatrixTopic[];
  outcomes: MatrixOutcome[];
  initialMastered: MasteredMap;
}) {
  const { mastered, toggle } = useOutcomeToggles(initialMastered);
  const [zone, setZone] = useState<ExamZone>("cat1");
  const [unmasteredOnly, setUnmasteredOnly] = useState(false);

  const outcomesByTopic = useMemo(() => {
    const map = new Map<string, MatrixOutcome[]>();
    for (const outcome of outcomes) {
      const list = map.get(outcome.topicId) ?? [];
      list.push(outcome);
      map.set(outcome.topicId, list);
    }
    return map;
  }, [outcomes]);

  const masteredCount = outcomes.filter((outcome) => mastered[outcome.id]).length;
  const overallPct = pct(masteredCount, outcomes.length);

  return (
    <div>
      {/* Header stats + filter */}
      <div className="glass-card mb-6 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="bg-primary/12 text-primary flex size-11 items-center justify-center rounded-xl">
            <Target className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Overall mastery
            </p>
            <p className="font-heading text-2xl font-bold tabular-nums">
              {overallPct}%{" "}
              <span className="text-muted-foreground text-sm font-medium">
                · <span className="tabular-nums">{masteredCount}</span> of{" "}
                <span className="tabular-nums">{outcomes.length}</span> outcomes
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Filter className="text-muted-foreground size-4" aria-hidden />
          <Switch
            id="unmastered-only"
            checked={unmasteredOnly}
            onCheckedChange={setUnmasteredOnly}
            aria-label="Show unmastered outcomes only"
          />
          <Label htmlFor="unmastered-only" className="cursor-pointer text-sm">
            Unmastered only
          </Label>
        </div>
      </div>

      <Tabs value={zone} onValueChange={(value) => setZone(value as ExamZone)}>
        <TabsList className="w-full sm:w-auto">
          {ZONES.map((zoneDefinition) => (
            <TabsTrigger
              key={zoneDefinition.id}
              value={zoneDefinition.id}
              className="flex-1 sm:flex-none"
            >
              {zoneDefinition.short}
            </TabsTrigger>
          ))}
        </TabsList>

        {ZONES.map((zoneDefinition) => {
          const zoneTopics = topics
            .filter((topic) => topic.zone === zoneDefinition.id)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          const zoneOutcomeIds = zoneTopics.flatMap((topic) =>
            (outcomesByTopic.get(topic.id) ?? []).map((outcome) => outcome.id),
          );
          const zoneMastered = zoneOutcomeIds.filter((id) => mastered[id]).length;
          const zonePct = pct(zoneMastered, zoneOutcomeIds.length);

          return (
            <TabsContent key={zoneDefinition.id} value={zoneDefinition.id} className="mt-4">
              <div className="glass-card p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{zoneDefinition.label} mastery</p>
                  <p className="text-muted-foreground text-sm">
                    <span className="text-primary font-semibold tabular-nums">{zonePct}%</span> ·{" "}
                    <span className="tabular-nums">
                      {zoneMastered} of {zoneOutcomeIds.length}
                    </span>{" "}
                    outcomes mastered
                  </p>
                </div>
                <Progress
                  value={zonePct}
                  className="mt-3"
                  aria-label={`${zonePct}% ${zoneDefinition.label} mastery`}
                />
              </div>

              <div className="mt-4 space-y-3">
                {zoneTopics.length === 0 ? (
                  <p className="glass-card text-muted-foreground p-6 text-sm">
                    No topics in this zone yet.
                  </p>
                ) : (
                  zoneTopics.map((topic) => {
                    const topicOutcomes = (outcomesByTopic.get(topic.id) ?? []).sort(
                      (a, b) => a.orderIndex - b.orderIndex,
                    );
                    const visibleOutcomes = unmasteredOnly
                      ? topicOutcomes.filter((outcome) => !mastered[outcome.id])
                      : topicOutcomes;
                    const topicMastered = topicOutcomes.filter(
                      (outcome) => mastered[outcome.id],
                    ).length;
                    const topicPct = pct(topicMastered, topicOutcomes.length);

                    if (unmasteredOnly && visibleOutcomes.length === 0) return null;

                    return (
                      <Collapsible key={topic.id} defaultOpen={unmasteredOnly}>
                        <div className="glass-card">
                          <CollapsibleTrigger className="group hover:bg-accent/40 focus-ring flex w-full flex-wrap items-center justify-between gap-3 rounded-t-xl p-4 text-left transition-colors">
                            <div className="min-w-0 flex-1">
                              <p className="font-heading text-sm font-semibold">{topic.title}</p>
                              <p className="text-muted-foreground mt-0.5 text-xs">
                                <span className="text-foreground/80 font-medium tabular-nums">
                                  {topicMastered}
                                </span>{" "}
                                of <span className="tabular-nums">{topicOutcomes.length}</span>{" "}
                                mastered
                                {topicOutcomes.length > 0 ? (
                                  <>
                                    {" "}
                                    ·{" "}
                                    <span className="text-primary font-semibold tabular-nums">
                                      {topicPct}%
                                    </span>
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div className="flex w-full items-center gap-3 sm:w-40">
                              <Progress
                                value={topicPct}
                                className="flex-1"
                                aria-label={`${topicPct}% mastery for ${topic.title}`}
                              />
                              <ChevronDown
                                className="text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180"
                                aria-hidden
                              />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {topicOutcomes.length === 0 ? (
                              <p className="border-border/60 text-muted-foreground border-t px-4 py-3 text-sm">
                                No outcomes mapped to this topic yet.
                              </p>
                            ) : (
                              <ul
                                className={cn(
                                  "divide-border/40 scrollbar-slim border-border/60 max-h-96 divide-y overflow-y-auto border-t",
                                )}
                              >
                                {visibleOutcomes.map((outcome) => (
                                  <OutcomeRow
                                    key={outcome.id}
                                    outcome={{
                                      id: outcome.id,
                                      code: outcome.code,
                                      statement: outcome.statement,
                                    }}
                                    mastered={mastered[outcome.id] ?? false}
                                    onToggle={toggle}
                                  />
                                ))}
                              </ul>
                            )}
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    );
                  })
                )}
              </div>

              <p className="text-muted-foreground mt-5 text-xs">
                Study the notes for each topic on the{" "}
                <Link
                  href={`/zones/${zoneDefinition.id}`}
                  className="text-primary underline underline-offset-2"
                >
                  {zoneDefinition.label} zone page
                </Link>{" "}
                — then tick outcomes off here as you master them.
              </p>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
