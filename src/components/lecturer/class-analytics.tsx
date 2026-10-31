"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/ui-bits";
import { zoneLabel } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ExamZone } from "@/types/domain";

/** Serializable view types mirroring src/lib/analytics/class.ts results. */
export interface MasteryPoint {
  topicId: string;
  title: string;
  zone: ExamZone;
  mastered: number;
  total: number;
}

export interface MockDistributionView {
  "0-49": number;
  "50-64": number;
  "65-79": number;
  "80-100": number;
}

export interface StudentRowView {
  userId: string;
  name: string;
  xp: number;
  streak: number;
  attempts: number;
  avgPct: number | null;
  mastered: number;
}

export interface StrugglingTopicView {
  topicTitle: string;
  zone: ExamZone;
  students: string[];
}

const zoneChartConfig = {
  cat1: { label: "CAT 1", color: "var(--chart-1)" },
  cat2: { label: "CAT 2", color: "var(--chart-2)" },
  main: { label: "Main", color: "var(--chart-3)" },
} satisfies ChartConfig;

const ZONE_FILL: Record<ExamZone, string> = {
  cat1: "var(--color-cat1)",
  cat2: "var(--color-cat2)",
  main: "var(--color-main)",
};

const BANDS = [
  { key: "0-49", label: "0–49%", fill: "#f43f5e" },
  { key: "50-64", label: "50–64%", fill: "#f59e0b" },
  { key: "65-79", label: "65–79%", fill: "#14b8a6" },
  { key: "80-100", label: "80–100%", fill: "#10b981" },
] as const;

type SortKey = "name" | "xp" | "streak" | "attempts" | "avgPct" | "mastered";

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "name", label: "Student" },
  { key: "xp", label: "XP", className: "text-right" },
  { key: "streak", label: "Streak", className: "text-right" },
  { key: "attempts", label: "Attempts", className: "text-right" },
  { key: "avgPct", label: "Avg %", className: "text-right" },
  { key: "mastered", label: "Mastered", className: "text-right" },
];

/**
 * Class analytics dashboard — topic mastery bars (colored by zone), mock score
 * distribution pie, a sortable students table with at-risk highlighting, and
 * the "struggling with X" panel.
 */
export function ClassAnalytics({
  mastery,
  distribution,
  students,
  struggling,
}: {
  mastery: MasteryPoint[];
  distribution: MockDistributionView;
  students: StudentRowView[];
  struggling: StrugglingTopicView[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  const masteryData = useMemo(
    () =>
      mastery
        .filter((topic) => topic.total > 0)
        .map((topic) => ({
          topicId: topic.topicId,
          title: topic.title,
          zone: topic.zone,
          mastered: topic.mastered,
          total: topic.total,
          pct: Math.round((topic.mastered / topic.total) * 1000) / 10,
        })),
    [mastery],
  );

  const pieData = useMemo(
    () =>
      BANDS.map((band) => ({
        name: band.label,
        value: distribution[band.key],
        fill: band.fill,
      })).filter((entry) => entry.value > 0),
    [distribution],
  );

  const distributionTotal = pieData.reduce((sum, entry) => sum + entry.value, 0);

  const sortedStudents = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...students].sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right)) * dir;
      }
      return ((left ?? -1) - (right ?? -1)) * dir;
    });
  }, [students, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-5">
        <section className="glass-card p-4 sm:p-6 lg:col-span-3" aria-labelledby="mastery-heading">
          <h2 id="mastery-heading" className="font-heading text-lg font-semibold">
            Topic mastery
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Share of mastered outcome records per topic, across every student.
          </p>
          {masteryData.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<BarChart3 className="size-5" aria-hidden />}
                title="No outcome progress yet"
                description="Once students start ticking outcomes in their checklists, mastery per topic appears here."
              />
            </div>
          ) : (
            <ChartContainer
              config={zoneChartConfig}
              className="mt-4 aspect-auto w-full"
              style={{ height: Math.min(560, Math.max(220, masteryData.length * 34)) }}
            >
              <BarChart
                data={masteryData}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={150}
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
                        const point = item.payload as (typeof masteryData)[number] | undefined;
                        if (!point) return null;
                        return (
                          <div className="flex min-w-44 flex-col gap-0.5 text-left">
                            <span className="font-semibold">{point.title}</span>
                            <span className="text-muted-foreground">
                              {zoneLabel(point.zone)} · {point.pct}% mastered
                            </span>
                            <span className="text-muted-foreground">
                              {point.mastered} of {point.total} outcome records
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="pct" name="Mastery" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {masteryData.map((entry) => (
                    <Cell key={entry.topicId} fill={ZONE_FILL[entry.zone]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </section>

        <section
          className="glass-card p-4 sm:p-6 lg:col-span-2"
          aria-labelledby="distribution-heading"
        >
          <h2 id="distribution-heading" className="font-heading text-lg font-semibold">
            Mock score distribution
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Submitted attempts over the last 30 days.
          </p>
          {distributionTotal === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<PieChartIcon className="size-5" aria-hidden />}
                title="No mocks submitted yet"
                description="Score bands fill in as students submit mock and past-paper attempts."
              />
            </div>
          ) : (
            <div className="mt-4">
              <ChartContainer config={zoneChartConfig} className="aspect-auto h-64 w-full">
                <PieChart>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        formatter={(value, _name) => (
                          <div className="flex min-w-32 items-center justify-between gap-3 text-left">
                            <span className="text-muted-foreground">{_name as string}</span>
                            <span className="font-semibold tabular-nums">
                              {value as number} (
                              {Math.round(((value as number) / distributionTotal) * 100)}%)
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={1}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                {BANDS.map((band) => (
                  <li
                    key={band.key}
                    className="text-muted-foreground flex items-center gap-1.5 text-xs"
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: band.fill }}
                      aria-hidden
                    />
                    {band.label} · {distribution[band.key]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="glass-card p-4 sm:p-6 lg:col-span-3" aria-labelledby="students-heading">
          <h2 id="students-heading" className="font-heading text-lg font-semibold">
            Students
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Click a column to sort · averages under 50% are highlighted.
          </p>
          {students.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<Users className="size-5" aria-hidden />}
                title="No students yet"
                description="Student rows appear once accounts are created and profiles exist."
              />
            </div>
          ) : (
            <div className="scrollbar-slim border-border/60 mt-4 max-h-96 overflow-y-auto rounded-xl border">
              <Table>
                <TableHeader className="bg-card sticky top-0 z-10">
                  <TableRow>
                    {COLUMNS.map((column) => (
                      <TableHead key={column.key} className={column.className}>
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          aria-label={`Sort by ${column.label}`}
                          className={cn(
                            "focus-ring hover:text-foreground inline-flex min-h-8 items-center gap-1 rounded font-medium",
                            column.className,
                          )}
                        >
                          {column.label}
                          {sort.key === column.key ? (
                            sort.dir === "asc" ? (
                              <ArrowUp className="size-3" aria-hidden />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden />
                            )
                          ) : (
                            <ArrowUpDown className="size-3 opacity-50" aria-hidden />
                          )}
                        </button>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedStudents.map((student) => {
                    const atRisk = student.avgPct !== null && student.avgPct < 50;
                    return (
                      <TableRow key={student.userId}>
                        <TableCell
                          className={cn(
                            "font-medium",
                            atRisk && "text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {student.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{student.xp}</TableCell>
                        <TableCell className="text-right tabular-nums">{student.streak}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.attempts}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            atRisk && "font-semibold text-rose-600 dark:text-rose-400",
                          )}
                        >
                          {student.avgPct === null ? "—" : `${student.avgPct}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {student.mastered}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section
          className="glass-card p-4 sm:p-6 lg:col-span-2"
          aria-labelledby="struggling-heading"
        >
          <h2 id="struggling-heading" className="font-heading text-lg font-semibold">
            Students struggling
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            The three lowest-mastery topics, with students under 30% on each.
          </p>
          {struggling.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                icon={<TrendingDown className="size-5" aria-hidden />}
                title="No mastery data yet"
                description="Once students record outcome progress, the weakest topics and who needs help appear here."
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {struggling.map((topic) => (
                <li
                  key={topic.topicTitle}
                  className="border-border/60 bg-muted/20 rounded-xl border p-3.5"
                >
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {topic.topicTitle}
                    <Badge variant="outline" className="text-[10px]">
                      {zoneLabel(topic.zone)}
                    </Badge>
                  </p>
                  {topic.students.length === 0 ? (
                    <p className="text-muted-foreground mt-1.5 text-xs">
                      No student is under 30% here — steady progress.
                    </p>
                  ) : (
                    <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
                      {topic.students.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
