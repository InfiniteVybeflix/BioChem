import type { Database, ExamZone } from "@/types/domain";

export const APP_NAME = "BioChem";
export const APP_TAGLINE = "Master biochemistry. Together.";

type ZoneRow = Database["public"]["Tables"]["topics"]["Row"];

export const ZONES: {
  id: ExamZone;
  label: string;
  short: string;
  description: string;
  href: string;
}[] = [
  {
    id: "cat1",
    label: "CAT 1",
    short: "CAT 1",
    description: "Foundations: water, biomolecules, proteins and enzymes.",
    href: "/zones/cat1",
  },
  {
    id: "cat2",
    label: "CAT 2",
    short: "CAT 2",
    description: "Metabolism: glycolysis, TCA, oxidative phosphorylation and beyond.",
    href: "/zones/cat2",
  },
  {
    id: "main",
    label: "Main Exam",
    short: "Main",
    description: "Molecular biology, techniques and full-course integration.",
    href: "/zones/main",
  },
];

export function zoneLabel(zone: ExamZone): string {
  return ZONES.find((z) => z.id === zone)?.label ?? zone;
}

export function zoneHref(zone: ExamZone): string {
  return ZONES.find((z) => z.id === zone)?.href ?? "/zones";
}

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const EVENT_COLORS = ["teal", "emerald", "amber", "rose", "violet", "cyan"] as const;

export function greetingForHour(hour: number): string {
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Good evening";
}

/** Topic tree helper: nests topics under their parent. */
export function nestTopics(topics: ZoneRow[]): (ZoneRow & { children: ZoneRow[] })[] {
  const byId = new Map<string, ZoneRow & { children: ZoneRow[] }>();
  for (const topic of topics) byId.set(topic.id, { ...topic, children: [] });
  const roots: (ZoneRow & { children: ZoneRow[] })[] = [];
  for (const topic of byId.values()) {
    if (topic.parent_id && byId.has(topic.parent_id)) {
      byId.get(topic.parent_id)!.children.push(topic);
    } else {
      roots.push(topic);
    }
  }
  return roots;
}
