"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * System → Database setup. Probes every table/column the console
 * needs and shows one idempotent SQL script that fixes whatever is
 * missing — the answer to most "could not create/update" errors.
 */

interface CheckRow {
  id: string;
  label: string;
  ok: boolean;
  detail: string | null;
}

interface SystemStatus {
  configured: boolean;
  checks: CheckRow[];
  fixSql: string;
  aiConfigured?: boolean;
}

export function SystemCheck() {
  const base = useConsoleBase();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(consoleUrl(base, "api/system"), { cache: "no-store" });
      const data = (await response.json()) as SystemStatus;
      setStatus(data);
    } catch {
      toast.error("Couldn't run the system check");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const copySql = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.fixSql);
      toast.success("Setup SQL copied — paste it in Supabase → SQL editor → Run");
    } catch {
      toast.error("Couldn't copy — select the SQL text and copy manually");
    }
  };

  const broken = status?.checks.filter((check) => !check.ok) ?? [];
  const allOk = status !== null && status.configured && broken.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Database className="text-primary size-4" aria-hidden /> Database setup &amp; health
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Every feature the console offers lives in a database table. If a feature fails
            (&ldquo;could not create&hellip;&rdquo;), it&apos;s almost always a table that
            hasn&apos;t been created yet — this check tells you exactly which one.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="focus-ring"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          Re-run check
        </Button>
      </div>

      {loading && !status ? (
        <div className="glass-card text-muted-foreground flex items-center gap-2 p-6 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking the database…
        </div>
      ) : status && !status.configured ? (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-4 text-sm">
          <p className="font-medium">Supabase isn&apos;t fully configured</p>
          <p className="text-muted-foreground mt-1 text-xs">{status.checks[0]?.detail}</p>
        </div>
      ) : status ? (
        <>
          <div
            className={
              allOk
                ? "border-emerald-500/40 bg-emerald-500/10 flex items-start gap-3 rounded-lg border p-4"
                : "border-amber-500/40 bg-amber-500/10 flex items-start gap-3 rounded-lg border p-4"
            }
          >
            {allOk ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            )}
            <div>
              <p className="text-sm font-medium">
                {allOk
                  ? "Everything is in place — the database is ready."
                  : `${broken.length} thing${broken.length === 1 ? " is" : "s are"} missing from the database`}
              </p>
              {!allOk ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  Copy the SQL below, paste it into{" "}
                  <span className="font-mono">Supabase → SQL editor</span> and press Run — it only
                  creates what&apos;s missing, so it is safe to run any time.
                </p>
              ) : null}
            </div>
          </div>

          <div className="glass-card divide-border/60 divide-y">
            {status.checks.map((check) => (
              <div key={check.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {check.ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                  )}
                  <span className="truncate font-mono text-sm">{check.label}</span>
                </div>
                <span
                  className={
                    check.ok
                      ? "text-muted-foreground shrink-0 text-xs"
                      : "shrink-0 text-xs text-amber-700 dark:text-amber-300"
                  }
                >
                  {check.ok ? "ready" : (check.detail ?? "missing")}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Fix-everything SQL (safe to re-run)</p>
              <Button type="button" size="sm" className="focus-ring" onClick={() => void copySql()}>
                <ClipboardCopy className="size-4" aria-hidden /> Copy SQL
              </Button>
            </div>
            <pre className="border-border/60 bg-muted/50 scrollbar-slim max-h-72 overflow-auto rounded-lg border p-4 text-xs leading-5">
              <code>{status.fixSql}</code>
            </pre>
          </div>

          {status.aiConfigured === false ? (
            <p className="text-amber-600 dark:text-amber-400 text-xs">
              The AI gateway isn&apos;t configured either — AI drafting, AI digest and the AI tutor
              stay offline until AEVIBRON_GATEWAY_URL / AEVIBRON_API_KEY are set on the deployment.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
