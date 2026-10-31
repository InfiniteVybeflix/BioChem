import { AlertTriangle, CloudOff, LifeBuoy } from "lucide-react";
import Link from "next/link";

/**
 * Rendered when part of the platform is not available on this
 * deployment. Deliberately free of infrastructure details — users
 * see a friendly status and a path to reach the team, nothing more.
 * Setup instructions live in the project README, not in the app.
 */
export function SetupNotice({
  missing,
  compact = false,
}: {
  missing: "app" | "gateway" | "push" | "cron";
  compact?: boolean;
}) {
  const config = {
    app: {
      icon: CloudOff,
      title: "The platform isn't fully connected yet",
      steps: [
        "Some features are temporarily unavailable.",
        "If this keeps happening, please contact support — the team responds in-app.",
      ],
    },
    gateway: {
      icon: CloudOff,
      title: "The AI assistant is taking a break",
      steps: [
        "AI features are temporarily unavailable on this deployment.",
        "Everything else (notes, exams, flashcards, planner) keeps working.",
        "If this keeps happening, please contact support.",
      ],
    },
    push: {
      icon: AlertTriangle,
      title: "Push notifications aren't enabled here",
      steps: [
        "This deployment doesn't have notifications turned on yet.",
        "In-app notifications still work — you'll never miss a reply.",
      ],
    },
    cron: {
      icon: AlertTriangle,
      title: "Scheduled tasks aren't configured yet",
      steps: [
        "Daily questions and reminders need a scheduler enabled by the platform team.",
        "You can still generate your daily set manually from the Question of the Day page.",
      ],
    },
  }[missing];

  const Icon = config.icon;

  return (
    <div
      className={`glass-card border-amber-500/30 p-4 ${compact ? "" : "p-6"}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">{config.title}</p>
          {!compact ? (
            <ul className="text-muted-foreground mt-2 list-disc space-y-1 pl-5 text-sm">
              {config.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">{config.steps[0]}</p>
          )}
          <p className="text-muted-foreground/80 mt-2 flex items-center gap-1 text-xs">
            <LifeBuoy className="size-3" aria-hidden />
            Need a hand?{" "}
            <Link href="/support" className="text-primary underline underline-offset-2">
              Contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
