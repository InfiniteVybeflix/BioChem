"use client";

import { useEffect, useRef, useState } from "react";
import { unzipSync } from "fflate";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  Clock,
  FileArchive,
  HelpCircle,
  Loader2,
  RotateCcw,
  Square,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * Staged, sequential bulk uploader.
 *
 * Stage 1 — the zip is unpacked in the browser (fflate) and every eligible
 * file is listed as a pending job. Nothing is published yet.
 * Stage 2 — "Process N files" publishes them strictly one at a time: one
 * request per file, per-file status, a live progress bar and toast
 * notifications. A failure never stops the batch, the run can be stopped
 * after the current file, and failed files can be retried on their own.
 */

interface BulkReportItem {
  file: string;
  kind: "note" | "question" | "other";
  inserted: number;
  error?: string;
}

interface BulkResult {
  report: BulkReportItem[];
  notes: number;
  questions: number;
  errors: number;
}

type ItemStatus = "pending" | "active" | "done" | "error" | "stopped";

interface QueueItem {
  id: string;
  name: string;
  kind: "note" | "question";
  blob: File;
  status: ItemStatus;
  inserted: number;
  error?: string;
}

const MAX_ZIP_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 200;
const PROGRESS_TOAST_ID = "bulk-progress";

const MD_EXAMPLE = `---
title: Glycolysis step by step
topic: glycolysis            # topic slug — must exist
summary: Every reaction of glycolysis on one page.
tags: [metabolism, exam]
readingMinutes: 12
examCritical: true
---

## Glycolysis
The pathway splits glucose into two pyruvate…`;

const JSON_EXAMPLE = `{
  "topic": "glycolysis",       // topic slug — must exist
  "zone": "cat2",              // cat1 | cat2 | main
  "difficulty": "medium",      // easy | medium | hard
  "type": "mcq",               // mcq | short_answer | long_answer | structured
  "questions": [
    {
      "stem": "Which enzyme catalyses the committed step of glycolysis?",
      "options": [
        { "key": "A", "text": "Hexokinase" },
        { "key": "B", "text": "Phosphofructokinase-1" }
      ],
      "answer": "B",
      "explanation": "PFK-1 catalyses the first irreversible step…",
      "marks": 1,
      "tags": ["regulation"]
    }
  ]
}`;

function makeItem(name: string, kind: "note" | "question", bytes: Uint8Array): QueueItem {
  // Copy into a plain ArrayBuffer so the File constructor is happy on every
  // TS/BlobPart combination (shared buffers are not valid BlobParts).
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return {
    id: name,
    name,
    kind,
    blob: new File([buffer], name),
    status: "pending",
    inserted: 0,
  };
}

export function BulkUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const [dragOver, setDragOver] = useState(false);
  const [staging, setStaging] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [overflow, setOverflow] = useState(0);
  const [running, setRunning] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(
    () => () => {
      // Leaving the page stops the queue and cleans up the progress toast.
      cancelRef.current = true;
      toast.dismiss(PROGRESS_TOAST_ID);
    },
    [],
  );

  const patchItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const stageFiles = async (file: File) => {
    if (running || staging) return;
    const lower = file.name.toLowerCase();

    if (lower.endsWith(".zip")) {
      if (file.size > MAX_ZIP_BYTES) {
        toast.error("That zip is larger than 10MB");
        return;
      }
      setStaging(true);
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch {
        setStaging(false);
        toast.error("That file could not be unzipped", {
          description: "Is it a valid zip archive?",
        });
        return;
      }
      setStaging(false);

      const names = Object.keys(entries)
        .filter((name) => !name.endsWith("/"))
        .sort((a, b) => a.localeCompare(b));
      const eligible = names.filter((name) => {
        const l = name.toLowerCase();
        return l.endsWith(".md") || (l.endsWith(".json") && !l.endsWith("package.json"));
      });
      const skippedOther = names.length - eligible.length;
      const over = Math.max(0, eligible.length - MAX_ENTRIES);
      const staged = eligible.slice(0, MAX_ENTRIES).map((name) => {
        const l = name.toLowerCase();
        return makeItem(name, l.endsWith(".md") ? "note" : "question", entries[name]);
      });

      setItems(staged);
      setOverflow(over);
      if (staged.length === 0) {
        toast.error("Nothing to publish", {
          description: skippedOther > 0
            ? `The zip held ${names.length} file(s) but none were .md notes or .json question files.`
            : "The zip is empty.",
        });
        return;
      }
      toast.info(`${staged.length} file${staged.length === 1 ? "" : "s"} staged`, {
        description: over > 0
          ? `Only the first ${MAX_ENTRIES} were staged. Review the list, then press “Process” to publish them one by one.`
          : 'Review the list, then press "Process" to publish them one by one.',
      });
      if (skippedOther > 0) {
        toast.message(`${skippedOther} unsupported file${skippedOther === 1 ? "" : "s"} skipped`, {
          description: "Only .md notes and .json question files are published.",
        });
      }
      return;
    }

    if (lower.endsWith(".md") || lower.endsWith(".json")) {
      const item = makeItem(
        file.name,
        lower.endsWith(".md") ? "note" : "question",
        new Uint8Array(await file.arrayBuffer()),
      );
      setItems([item]);
      setOverflow(0);
      return;
    }

    toast.error("Only .zip, .md and .json files are supported");
  };

  const runQueue = async (queue: QueueItem[]) => {
    if (running || queue.length === 0) return;
    cancelRef.current = false;
    setRunning(true);

    let ok = 0;
    let failed = 0;
    let notes = 0;
    let questions = 0;
    let stopped = false;
    let sessionExpired = false;
    const total = queue.length;

    toast.loading(`Starting — 0/${total} files`, { id: PROGRESS_TOAST_ID });

    for (const item of queue) {
      if (cancelRef.current) {
        patchItem(item.id, { status: "stopped" });
        stopped = true;
        continue;
      }
      patchItem(item.id, { status: "active" });
      toast.loading(`${ok + failed}/${total} — ${item.name}`, { id: PROGRESS_TOAST_ID });
      try {
        if (item.blob.size > MAX_FILE_BYTES) throw new Error("File is larger than 2MB");
        const body = new FormData();
        body.append("file", item.blob, item.name);
        const response = await fetch("/api/content/bulk", {
          method: "POST",
          body,
          credentials: "include",
        });
        if (response.status === 401) {
          sessionExpired = true;
          throw new Error("Your session expired — sign in again, then retry the failed files");
        }
        const payload = (await response.json().catch(() => null)) as
          | (BulkResult & { error?: string })
          | null;
        if (!response.ok) {
          throw new Error(payload?.error ?? `The server answered ${response.status}`);
        }
        const first = payload?.report?.[0];
        if (first?.error) throw new Error(first.error);
        const inserted = first?.inserted ?? 0;
        if (item.kind === "note") notes += inserted;
        else questions += inserted;
        ok += 1;
        patchItem(item.id, { status: "done", inserted });
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Upload failed";
        patchItem(item.id, { status: "error", error: message });
        toast.error(`${item.name} failed`, { description: message });
        if (sessionExpired) break;
      }
    }

    setRunning(false);
    const processed = ok + failed;
    const summary = `${notes} note${notes === 1 ? "" : "s"} and ${questions} question${
      questions === 1 ? "" : "s"
    } published`;
    if (sessionExpired) {
      toast.error("Stopped — sign in again", {
        id: PROGRESS_TOAST_ID,
        description: `${processed}/${total} processed. Sign in, then press "Retry failed" to finish the rest.`,
      });
    } else if (stopped) {
      toast.warning(`Stopped at ${processed}/${total}`, {
        id: PROGRESS_TOAST_ID,
        description: failed > 0
          ? `${summary}. Press "Retry failed" or "Process remaining".`
          : `${summary}. Press "Process remaining" to continue.`,
      });
    } else if (failed > 0) {
      toast.warning(`${processed}/${total} processed — ${failed} failed`, {
        id: PROGRESS_TOAST_ID,
        description: `${summary}. Press "Retry failed" for the rest.`,
      });
    } else {
      toast.success(`All ${total} files processed`, {
        id: PROGRESS_TOAST_ID,
        description: summary,
      });
    }
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void stageFiles(file);
  };

  const total = items.length;
  const processedCount = items.filter(
    (item) => item.status === "done" || item.status === "error" || item.status === "stopped",
  ).length;
  const doneItems = items.filter((item) => item.status === "done");
  const notesOk = doneItems
    .filter((item) => item.kind === "note")
    .reduce((sum, item) => sum + item.inserted, 0);
  const questionsOk = doneItems
    .filter((item) => item.kind === "question")
    .reduce((sum, item) => sum + item.inserted, 0);
  const failedCount = items.filter((item) => item.status === "error").length;
  const remainingCount = items.filter(
    (item) => item.status === "pending" || item.status === "stopped",
  ).length;
  const percent = total === 0 ? 0 : Math.round((processedCount / total) * 100);
  const busy = running || staging;

  const startRemaining = () => {
    const queue = items.filter(
      (item) => item.status === "pending" || item.status === "stopped",
    );
    queue.forEach((item) => patchItem(item.id, { status: "pending" }));
    void runQueue(queue);
  };

  const retryFailed = () => {
    const queue = items.filter((item) => item.status === "error");
    queue.forEach((item) => patchItem(item.id, { status: "pending" }));
    void runQueue(queue);
  };

  const reset = () => {
    if (running) return;
    setItems([]);
    setOverflow(0);
    toast.dismiss(PROGRESS_TOAST_ID);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all",
          dragOver
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/20 hover:border-primary/50",
          busy && "pointer-events-none opacity-70",
        )}
        onClick={() => {
          if (!busy) inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          id="bulk-zip"
          type="file"
          accept=".zip,.md,.json,application/zip,text/markdown,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void stageFiles(file);
            event.target.value = "";
          }}
        />
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl">
          {staging ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <FileArchive className="size-5" aria-hidden />
          )}
        </span>
        {staging ? (
          <p className="text-sm font-medium">Unpacking the archive…</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {running ? "Processing — one file at a time" : "Drop a .zip (or a single .md / .json) here, or browse"}
            </p>
            <p className="text-muted-foreground max-w-md text-xs">
              Files are staged first — nothing is published until you press Process. Then each
              file is uploaded one at a time with live progress. Up to {MAX_ENTRIES} entries, 10MB
              zip.
            </p>
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.click();
              }}
            >
              <Upload className="size-4" aria-hidden />
              Browse files
            </Button>
          </>
        )}
        <label htmlFor="bulk-zip" className="sr-only">
          Choose a zip archive or a single content file to upload
        </label>
      </div>

      {total > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {notesOk} note{notesOk === 1 ? "" : "s"} and {questionsOk} question
              {questionsOk === 1 ? "" : "s"} published
              {failedCount > 0 ? ` · ${failedCount} failed` : ""}
              {overflow > 0 ? ` · ${overflow} not staged (limit ${MAX_ENTRIES})` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {running ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="focus-ring"
                  onClick={() => {
                    cancelRef.current = true;
                  }}
                >
                  <Square className="size-3.5" aria-hidden />
                  Stop after this file
                </Button>
              ) : (
                <>
                  {remainingCount > 0 ? (
                    <Button
                      type="button"
                      size="sm"
                      className="focus-ring"
                      onClick={startRemaining}
                    >
                      Process remaining ({remainingCount})
                    </Button>
                  ) : null}
                  {failedCount > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="focus-ring"
                      onClick={retryFailed}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      Retry failed ({failedCount})
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="focus-ring"
                    onClick={reset}
                  >
                    Clear list
                  </Button>
                </>
              )}
            </div>
          </div>

          <Progress value={percent} className="h-2" aria-label={`Bulk upload ${percent}% done`} />
          <p className="text-muted-foreground text-xs">
            {processedCount}/{total} files processed
            {running ? " — uploading one at a time…" : ""}
          </p>

          <ul className="glass-card divide-border/60 scrollbar-slim max-h-96 divide-y overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-2.5 px-4 py-3">
                {item.status === "done" ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : item.status === "error" ? (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                ) : item.status === "active" ? (
                  <Loader2 className="text-primary mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                ) : item.status === "stopped" ? (
                  <Ban className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {item.name}
                    <span className="text-muted-foreground ml-2 text-xs">
                      {item.kind === "note" ? "note" : "questions"}
                    </span>
                  </span>
                  {item.status === "done" ? (
                    <span className="text-muted-foreground block text-xs">
                      ✓ {item.inserted} {item.kind === "note" ? "note" : "question"}
                      {item.inserted === 1 ? "" : "s"} inserted
                    </span>
                  ) : item.status === "error" ? (
                    <span className="text-destructive block text-xs">{item.error}</span>
                  ) : item.status === "active" ? (
                    <span className="text-primary block text-xs">Uploading…</span>
                  ) : item.status === "stopped" ? (
                    <span className="text-muted-foreground block text-xs">Not processed</span>
                  ) : (
                    <span className="text-muted-foreground block text-xs">Queued</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Collapsible open={helpOpen} onOpenChange={setHelpOpen}>
        <CollapsibleTrigger className="focus-ring text-muted-foreground hover:text-foreground flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium transition-colors">
          <HelpCircle className="size-4" aria-hidden />
          {helpOpen ? "Hide format help" : "What goes inside the zip?"}
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground space-y-4 pt-2 text-sm">
          <div className="space-y-2">
            <p className="text-foreground font-medium">
              Notes — one .md file per note with YAML frontmatter:
            </p>
            <pre className="scrollbar-slim border-border/70 bg-muted/40 text-foreground/90 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
              {MD_EXAMPLE}
            </pre>
            <p className="text-xs">
              Fields: <span className="font-mono">title</span>,{" "}
              <span className="font-mono">topic</span> (slug),{" "}
              <span className="font-mono">summary</span>, <span className="font-mono">tags</span>,{" "}
              <span className="font-mono">readingMinutes</span>,{" "}
              <span className="font-mono">examCritical</span>. The markdown body below the
              frontmatter becomes the note content.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-foreground font-medium">
              Questions — one .json file per topic batch:
            </p>
            <pre className="scrollbar-slim border-border/70 bg-muted/40 text-foreground/90 overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
              {JSON_EXAMPLE}
            </pre>
            <p className="text-xs">
              package.json is skipped automatically. Malformed files are reported per file and never
              break the rest of the upload.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
