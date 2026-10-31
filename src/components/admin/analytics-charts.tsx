"use client";

import { format, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, BarChart3, BrainCircuit, Trophy, Users } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/common/ui-bits";
import { zoneLabel } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

/** Serializable view types for the admin analytics page. */
export interface DailyPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ContributorRow {
  name: string;
  points: number;
  contributions: number;
}

export interface ZoneMasteryRow {
  zone: ExamZone;
  pct: number;
}

export interface AiUsageRow {
  task: string;
  counts: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: "var(--chart-2)",
  failed: "#f43f5e",
};

const FALLBACK_STATUS_COLOR = "var(--chart-4)";

const dauConfig = {
  count: { label: "Active users", color: "var(--chart-1)" },
} satisfies ChartConfig;
const attemptsConfig = {
  count: { label: "Attempts", color: "var(--chart-2)" },
} satisfies ChartConfig;
const contributorsConfig = {
  points: { label: "Points", color: "var(--chart-3)" },
} satisfies ChartConfig;

function dayLabel(date: string): string {
  return format(parseISO(date), "d MMM");
}

function withLabels(points: DailyPoint[]): { label: string; count: number }[] {
  return points.map((point) => ({ label: dayLabel(point.date), count: point.count }));
}

/**
 * Admin analytics dashboard — 30-day DAU area chart, attempts-per-day line,
 * all-time top contributors, per-zone mastery progress bars and a stacked
 * AI-usage-by-task chart. Each chart carries its own empty state.
 */
export function AnalyticsCharts({
  dau,
  attemptsPerDay,
  contributors,
  zoneMastery,
  aiUsage,
  aiStatuses,
}: {
  dau: DailyPoint[];
  attemptsPerDay: DailyPoint[];
  contributors: ContributorRow[];
  zoneMastery: ZoneMasteryRow[];
  aiUsage: AiUsageRow[];
  aiStatuses: string[];
}) {
  const dauData = withLabels(dau);
  const attemptsData = withLabels(attemptsPerDay);
  const dauTotal = dau.reduce((sum, point) => sum + point.count, 0);
  const attemptsTotal = attemptsPerDay.reduce((sum, point) => sum + point.count, 0);
  const aiTotal = aiUsage.reduce(
    (sum, row) => sum + Object.values(row.counts).reduce((a, b) => a + b, 0),
    0,
  );

  const aiConfig: ChartConfig = {};
  for (const status of aiStatuses) {
    aiConfig[status] = { label: status, color: STATUS_COLORS[status] ?? FALLBACK_STATUS_COLOR };
  }
  const aiChartData = aiUsage.map((row) => ({ task: row.task, ...row.counts }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-card p-4 sm:p-6" aria-labelledby="dau-heading">
          <h2 id="dau-heading" className="font-heading text-lg font-semibold">
            Daily active users
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Students whose last streak touch was that day (last 30 days).
          </p>
          {dauTotal === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Users className="size-5" aria-hidden />}
                title="No active users yet"
                description="DAU fills in as students open the app and their streaks are touched."
              />
            </div>
          ) : (
            <ChartContainer config={dauConfig} className="mt-4 aspect-auto h-64 w-full">
              <AreaChart data={dauData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Area
                  dataKey="count"
                  name="Active users"
                  type="monotone"
                  stroke="var(--color-count)"
                  fill="var(--color-count)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </section>

        <section className="glass-card p-4 sm:p-6" aria-labelledby="attempts-heading">
          <h2 id="attempts-heading" className="font-heading text-lg font-semibold">
            Mocks per day
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Submitted exam attempts over the last 30 days.
          </p>
          {attemptsTotal === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Activity className="size-5" aria-hidden />}
                title="No attempts yet"
                description="The daily attempt count appears once students start submitting mocks."
              />
            </div>
          ) : (
            <ChartContainer config={attemptsConfig} className="mt-4 aspect-auto h-64 w-full">
              <LineChart data={attemptsData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Line
                  dataKey="count"
                  name="Attempts"
                  type="monotone"
                  stroke="var(--color-count)"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 1 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="glass-card p-4 sm:p-6" aria-labelledby="contributors-heading">
          <h2 id="contributors-heading" className="font-heading text-lg font-semibold">
            Top contributors
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            All-time leaderboard leaders by XP points.
          </p>
          {contributors.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Trophy className="size-5" aria-hidden />}
                title="No leaderboard entries yet"
                description="Points accrue as students contribute notes and answers that get published."
              />
            </div>
          ) : (
            <ChartContainer
              config={contributorsConfig}
              className="mt-4 aspect-auto w-full"
              style={{ height: Math.min(360, Math.max(220, contributors.length * 36)) }}
            >
              <BarChart
                data={contributors}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={140}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)" }}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(_value, _name, item) => {
                        const row = item.payload as ContributorRow | undefined;
                        if (!row) return null;
                        return (
                          <div className="flex min-w-40 flex-col gap-0.5 text-left">
                            <span className="font-semibold">{row.name}</span>
                            <span className="text-muted-foreground">{row.points} points</span>
                            <span className="text-muted-foreground">
                              {row.contributions} contributions
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="points" name="Points" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ChartContainer>
          )}
        </section>

        <section className="glass-card p-4 sm:p-6" aria-labelledby="zone-mastery-heading">
          <h2 id="zone-mastery-heading" className="font-heading text-lg font-semibold">
            Zone mastery
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Average mastery across the topics of each exam zone (all students).
          </p>
          {zoneMastery.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<BarChart3 className="size-5" aria-hidden />}
                title="No mastery data yet"
                description="Zone averages appear once students record outcome progress."
              />
            </div>
          ) : (
            <ul className="mt-6 space-y-5">
              {zoneMastery.map((row) => (
                <li key={row.zone}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{zoneLabel(row.zone)}</span>
                    <span className="text-muted-foreground tabular-nums">{row.pct}%</span>
                  </div>
                  <Progress
                    value={row.pct}
                    aria-label={`${zoneLabel(row.zone)} average mastery ${row.pct}%`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="glass-card p-4 sm:p-6" aria-labelledby="ai-usage-heading">
        <h2 id="ai-usage-heading" className="font-heading text-lg font-semibold">
          AI usage by task
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Gateway requests per task over the last 30 days, stacked by status.
        </p>
        {aiTotal === 0 ? (
          <div className="mt-6">
            <EmptyState
              icon={<BrainCircuit className="size-5" aria-hidden />}
              title="No AI usage recorded"
              description="Requests appear here as students use the tutor, explain modes, flashcards and planners."
            />
          </div>
        ) : (
          <ChartContainer config={aiConfig} className="mt-4 aspect-auto h-72 w-full">
            <BarChart data={aiChartData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="task" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {aiStatuses.map((status) => (
                <Bar
                  key={status}
                  dataKey={status}
                  name={status}
                  stackId="ai"
                  fill={`var(--color-${status})`}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </section>
    </div>
  );
}
