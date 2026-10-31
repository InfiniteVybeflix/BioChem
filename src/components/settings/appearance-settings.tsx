"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun, Wind } from "lucide-react";
import { cn } from "@/lib/utils";

const THEME_CARDS = [
  {
    value: "light",
    label: "Light",
    description: "Bright blueprint grid, best in daylight.",
    icon: Sun,
    swatches: ["bg-white", "bg-muted", "bg-primary"],
  },
  {
    value: "dark",
    label: "Dark",
    description: "Deep charcoal with glowing accents.",
    icon: Moon,
    swatches: ["bg-zinc-900", "bg-zinc-800", "bg-primary"],
  },
  {
    value: "system",
    label: "System",
    description: "Follows your device's appearance setting.",
    icon: Monitor,
    swatches: ["bg-white", "bg-zinc-900", "bg-primary"],
  },
] as const;

/**
 * Appearance settings: full-width theme radio cards (mirrors the header
 * toggle) plus a reduced-motion note reflecting the visitor's OS setting.
 */
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);

  useEffect(() => {
    setMounted(true);
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const active = mounted ? theme : undefined;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-heading text-base font-semibold">Theme</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Applies instantly across the app — pages, charts and diagrams included.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="Colour theme">
          {THEME_CARDS.map((card) => {
            const selected = active === card.value;
            const Icon = card.icon;
            return (
              <button
                key={card.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTheme(card.value)}
                className={cn(
                  "focus-ring glass-card group relative flex flex-col p-4 text-left transition-all hover:-translate-y-0.5 motion-reduce:transition-none",
                  selected && "border-primary ring-primary/60 ring-1",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="text-primary size-4.5" aria-hidden />
                    {card.label}
                  </span>
                  {selected ? <Check className="text-primary size-4" aria-hidden /> : null}
                </span>
                <span className="text-muted-foreground mt-2 text-xs leading-5">
                  {card.description}
                </span>
                <span className="mt-4 flex gap-1.5" aria-hidden>
                  {card.swatches.map((swatch, index) => (
                    <span
                      key={index}
                      className={cn("border-border size-6 rounded-md border", swatch)}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-4">
        <h3 className="font-heading flex items-center gap-2 text-base font-semibold">
          <Wind className="text-primary size-4.5" aria-hidden />
          Reduced motion
        </h3>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {reducedMotion === null
            ? "Detecting your system motion preference…"
            : reducedMotion
              ? "Your device requests reduced motion — BioChem keeps its transitions subtle and skips decorative animation."
              : "Your device allows full motion — you'll see the usual subtle hover lifts and transitions. Your OS reduced-motion setting is respected automatically whenever you enable it."}
        </p>
      </div>
    </div>
  );
}
