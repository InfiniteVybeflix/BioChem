import { cn } from "@/lib/utils";

/**
 * NovaMark — Nova's brand glyph.
 *
 * A four-point AI sparkle with a secondary companion star and a subtle
 * gradient. Rendered in the floating-tutor launcher/panel, chat avatars
 * and the tutor page so Nova is instantly recognisable across the app.
 *
 * Pure SVG with `currentColor` for the core strokes, so it adapts to any
 * foreground (white on the gradient launcher, primary on tinted chips).
 */
export function NovaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      {/* Four-point main star */}
      <path
        d="M12 2.5c.35 3.9 1.4 6.6 3.05 8.05C16.7 12 19.2 12.6 21.5 12c-3.9.35-6.6 1.4-8.05 3.05C12 16.7 11.4 19.2 12 21.5c-.35-3.9-1.4-6.6-3.05-8.05C7.3 12 4.8 11.4 2.5 12c3.9-.35 6.6-1.4 8.05-3.05C12 7.3 12.6 4.8 12 2.5Z"
        fill="currentColor"
      />
      {/* Companion star (top-right) */}
      <path
        d="M18.8 2.2c.14 1.56.56 2.64 1.22 3.22.66.58 1.66.82 2.98.62-1.56.14-2.64.56-3.22 1.22-.58.66-.82 1.66-.62 2.98-.14-1.56-.56-2.64-1.22-3.22-.66-.58-1.66-.82-2.98-.62 1.56-.14 2.64-.56 3.22-1.22.58-.66.82-1.66.62-2.98Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  );
}
