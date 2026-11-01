import {
  Atom,
  BookOpen,
  BrainCircuit,
  Calendar,
  ClipboardCheck,
  Dna,
  Download,
  FlaskConical,
  Globe,
  GraduationCap,
  Layers,
  Library,
  Lightbulb,
  MessagesSquare,
  Microscope,
  NotebookPen,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Curated icon set for CMS-managed landing-page feature cards.
 * Icons are stored by name (`icon` column on site_features) so the
 * database never holds components — resolve with `featureIcon(name)`.
 * No "use client" — safe to import from server components, client
 * components and API routes alike.
 */

export const FEATURE_ICONS = {
  layers: Layers,
  "brain-circuit": BrainCircuit,
  atom: Atom,
  "graduation-cap": GraduationCap,
  calendar: Calendar,
  "messages-square": MessagesSquare,
  trophy: Trophy,
  download: Download,
  "book-open": BookOpen,
  "flask-conical": FlaskConical,
  dna: Dna,
  microscope: Microscope,
  sparkles: Sparkles,
  target: Target,
  zap: Zap,
  users: Users,
  "clipboard-check": ClipboardCheck,
  lightbulb: Lightbulb,
  "trending-up": TrendingUp,
  "shield-check": ShieldCheck,
  timer: Timer,
  "notebook-pen": NotebookPen,
  globe: Globe,
  star: Star,
  rocket: Rocket,
  library: Library,
} as const satisfies Record<string, LucideIcon>;

export type FeatureIconName = keyof typeof FEATURE_ICONS;

export function isFeatureIconName(value: string): value is FeatureIconName {
  return Object.hasOwn(FEATURE_ICONS, value);
}

/** Resolve an icon name to a component — unknown names fall back to Sparkles. */
export function featureIcon(name: string): LucideIcon {
  return isFeatureIconName(name) ? FEATURE_ICONS[name] : Sparkles;
}

export const FEATURE_ICON_OPTIONS: { value: FeatureIconName; label: string }[] = (
  Object.keys(FEATURE_ICONS) as FeatureIconName[]
).map((value) => ({
  value,
  label: value.replaceAll("-", " ").replace(/^\w/, (c) => c.toUpperCase()),
}));
