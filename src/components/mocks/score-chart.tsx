"use client";

import { format, parseISO } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/common/ui-bits";
import { zoneLabel } from "@/lib/constants";
import type { AttemptListItem } from "./types";
import type { AttemptMode, ExamZone } from "@/types/domain";

const chartConfig = {
  score: { label: "Score", color: "var(--primary)" },
} satisfies ChartConfig;

interface ChartPoint {
  label: string;
  score: number;
  zone: ExamZone;
  mode: AttemptMode;
  rawScore: number;
  maxScore: number;
  submittedAt: string;
}

const MODE_LABELS: Record<AttemptMode, string> = {
  practice: "Practice",
  mock: "Mock",
  custom: "Custom exam",
  past_paper: "Past paper",
};

/** Line chart of mock percentages over time (submitted attempts only). */
export function ScoreChart({ attempts }: { attempts: AttemptListItem[] }) {
  const points: ChartPoint[] = attempts
    .filter(
      (attempt): attempt is AttemptListItem & { submittedAt: string } =>
        attempt.status === "submitted" &&
        typeof attempt.submittedAt === "string" &&
        attempt.maxScore > 0,
    )
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .map((attempt) => ({
      label: format(parseISO(attempt.submittedAt), "d MMM"),
      score: Math.round((attempt.score / attempt.maxScore) * 100),
      zone: attempt.zone,
      mode: attempt.mode,
      rawScore: attempt.score,
      maxScore: attempt.maxScore,
      submittedAt: attempt.submittedAt,
    }));

  if (points.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="size-5" aria-hidden />}
        title="No scores yet"
        description="Sit your first mock — your percentage trend will appear here after you submit."
      />
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">Score trend</h2>
        <span className="text-muted-foreground text-xs">{points.length} submitted</span>
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" width={44} />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_value, _name, item) => {
                  const point = item.payload as ChartPoint | undefined;
                  if (!point) return null;
                  return (
                    <div className="flex min-w-44 flex-col gap-0.5 text-left">
                      <span className="font-semibold tabular-nums">
                        {point.rawScore}/{point.maxScore} ({point.score}%)
                      </span>
                      <span className="text-muted-foreground">
                        {zoneLabel(point.zone)} · {MODE_LABELS[point.mode]}
                      </span>
                      <span className="text-muted-foreground">
                        {format(parseISO(point.submittedAt), "EEE d MMM yyyy, HH:mm")}
                      </span>
                    </div>
                  );
                }}
              />
            }
          />
          <Line
            dataKey="score"
            name="Score"
            type="monotone"
            stroke="var(--color-score)"
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 1 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
