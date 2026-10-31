import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardCheck, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ZONES, zoneLabel } from "@/lib/constants";

type ZoneDefinition = (typeof ZONES)[number];

/**
 * Large zone overview card on /zones: real content counts plus the signed-in
 * user's outcome mastery for the zone. Links into /zones/[zone].
 */
export function ZoneCard({
  zone,
  notesCount,
  questionsCount,
  outcomesCount,
  masteredCount,
}: {
  zone: ZoneDefinition;
  notesCount: number;
  questionsCount: number;
  outcomesCount: number;
  masteredCount: number;
}) {
  const masteryPct = outcomesCount > 0 ? Math.round((masteredCount / outcomesCount) * 100) : 0;

  return (
    <Link
      href={`/zones/${zone.id}`}
      className="glass-card group hover:border-primary/40 hover:shadow-primary/10 focus-ring flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">{zoneLabel(zone.id)}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-6">{zone.description}</p>
        </div>
        <ArrowRight
          className="text-muted-foreground/50 group-hover:text-primary mt-1 size-5 shrink-0 transition-all group-hover:translate-x-1"
          aria-hidden
        />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="border-border/60 bg-card/50 rounded-lg border px-2 py-2.5">
          <dt className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium tracking-wide uppercase">
            <BookOpen className="size-3" aria-hidden />
            Notes
          </dt>
          <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums">{notesCount}</dd>
        </div>
        <div className="border-border/60 bg-card/50 rounded-lg border px-2 py-2.5">
          <dt className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium tracking-wide uppercase">
            <ClipboardCheck className="size-3" aria-hidden />
            Questions
          </dt>
          <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums">{questionsCount}</dd>
        </div>
        <div className="border-border/60 bg-card/50 rounded-lg border px-2 py-2.5">
          <dt className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] font-medium tracking-wide uppercase">
            <Target className="size-3" aria-hidden />
            Outcomes
          </dt>
          <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums">{outcomesCount}</dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-medium">Your outcome mastery</span>
          <span className="text-primary font-semibold tabular-nums">{masteryPct}%</span>
        </div>
        <Progress
          value={masteryPct}
          className="mt-1.5"
          aria-label={`${masteryPct}% of ${zone.label} outcomes mastered`}
        />
        <p className="text-muted-foreground mt-1.5 text-xs">
          <span className="text-foreground/80 font-medium tabular-nums">{masteredCount}</span> of{" "}
          <span className="tabular-nums">{outcomesCount}</span> outcomes mastered
        </p>
      </div>

      <p className="text-primary mt-5 text-xs font-medium">
        Topic tree · notes · outcomes · question bank · mocks →
      </p>
    </Link>
  );
}
