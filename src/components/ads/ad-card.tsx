"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Presentational sponsored-ad card, shared by the student-facing AdSlot
 * and the console placement preview — what the operator sees in the
 * preview is exactly what students get.
 *
 * `variant` comes from the slot the card is rendered in (wide banner
 * strip, compact rail card, or standard inline card); `size` is the
 * per-ad rendering size chosen in the console.
 */

export type AdCardVariant = "banner" | "sidebar" | "card";
export type AdCardSize = "compact" | "standard" | "large";

export interface AdCardData {
  title: string;
  body: string;
  ctaLabel: string;
  imageUrl: string | null;
}

const CONTAINER: Record<AdCardSize, string> = {
  compact: "p-3",
  standard: "p-4 sm:p-5",
  large: "p-5 sm:p-7",
};

const TITLE: Record<AdCardSize, string> = {
  compact: "text-sm",
  standard: "text-base",
  large: "font-heading text-lg",
};

const BODY: Record<AdCardSize, string> = {
  compact: "text-xs leading-5",
  standard: "text-sm leading-6",
  large: "text-sm leading-7",
};

const BANNER_IMAGE: Record<AdCardSize, string> = {
  compact: "h-12 w-full rounded-lg object-cover ring-1 ring-border/60 sm:w-24",
  standard: "ring-border/60 h-20 w-full rounded-lg object-cover ring-1 sm:w-36",
  large: "ring-border/60 h-28 w-full rounded-lg object-cover ring-1 sm:w-52",
};

const INLINE_IMAGE: Record<AdCardSize, string> = {
  compact: "mt-2 max-h-20 w-full rounded-lg object-cover ring-1 ring-border/60",
  standard: "ring-border/60 mt-3 max-h-40 w-full rounded-lg object-cover ring-1",
  large: "ring-border/60 mt-3 max-h-64 w-full rounded-lg object-cover ring-1",
};

export function AdCard({
  ad,
  variant,
  size = "standard",
  onCta,
  className,
}: {
  ad: AdCardData;
  variant: AdCardVariant;
  size?: AdCardSize;
  /** Click handler for the CTA. Omit for a static preview. */
  onCta?: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "glass-card border-amber-500/30",
        CONTAINER[size],
        variant === "banner" && "flex max-w-none flex-col gap-4 sm:flex-row sm:items-center",
        variant === "card" && "max-w-2xl",
        className,
      )}
      aria-label="Sponsored placement"
    >
      {ad.imageUrl && variant === "banner" ? (
        // image_url is an arbitrary external URL set from the console — a plain img
        // keeps deployments working without extending next/image remote patterns.
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={ad.imageUrl} alt="" className={BANNER_IMAGE[size]} loading="lazy" />
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
          <Sparkles className="size-3" aria-hidden />
          Sponsored
        </span>
        <p className={cn("font-heading mt-2.5 font-semibold", TITLE[size])}>{ad.title}</p>
        <p className={cn("text-muted-foreground mt-1", BODY[size])}>{ad.body}</p>
        {ad.imageUrl && variant !== "banner" ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={ad.imageUrl} alt="" className={INLINE_IMAGE[size]} loading="lazy" />
        ) : null}
        <Button
          type="button"
          variant="outline"
          size={size === "large" ? "default" : "sm"}
          onClick={onCta}
          className="focus-ring mt-3 border-amber-500/40 hover:border-amber-500/60"
        >
          {ad.ctaLabel}
          <ExternalLink className="size-3.5" aria-hidden />
        </Button>
      </div>
    </aside>
  );
}
