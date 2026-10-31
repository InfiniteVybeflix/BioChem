"use client";

import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileArchive,
  HelpCircle,
  Loader2,
  RotateCcw,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

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

const MAX_ZIP_BYTES = 10 * 1024 * 1024;

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

/**
 * Zip bulk uploader — drag-and-drop or browse. Posts the archive to
 * /api/content/bulk and renders the per-file report the API returns.
 */
export function BulkUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const upload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Only .zip archives are supported");
      return;
    }
    if (file.size > MAX_ZIP_BYTES) {
      toast.error("That zip is larger than 10MB");
      return;
    }

    setUploading(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/content/bulk", {
        method: "POST",
        body,
        credentials: "include",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Upload failed";
        toast.error("Bulk upload failed", { description: message });
        return;
      }
      const data = payload as BulkResult;
      setResult(data);
      if (data.notes === 0 && data.questions === 0) {
        toast.error("Nothing was published", {
          description:
            data.errors > 0 ? `${data.errors} file(s) had problems — see the report.` : undefined,
        });
      } else {
        toast.success(
          `${data.notes} note${data.notes === 1 ? "" : "s"} and ${data.questions} question${
            data.questions === 1 ? "" : "s"
          } published${data.errors > 0 ? ` · ${data.errors} file(s) skipped` : ""}`,
        );
      }
    } catch {
      toast.error("Upload failed", { description: "Network error — please try again." });
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
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
        )}
      >
        <input
          ref={inputRef}
          id="bulk-zip"
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = "";
          }}
        />
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl">
          {uploading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <FileArchive className="size-5" aria-hidden />
          )}
        </span>
        {uploading ? (
          <p className="text-sm font-medium">Uploading and processing…</p>
        ) : (
          <>
            <p className="text-sm font-medium">Drag a .zip archive here, or browse</p>
            <p className="text-muted-foreground max-w-md text-xs">
              Markdown notes (with frontmatter) and JSON question files — up to 10MB and 200 entries
              per zip.
            </p>
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-4" aria-hidden />
              Browse files
            </Button>
          </>
        )}
        <label htmlFor="bulk-zip" className="sr-only">
          Choose a zip archive to upload
        </label>
      </div>

      {result ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {result.notes} note{result.notes === 1 ? "" : "s"} and {result.questions} question
              {result.questions === 1 ? "" : "s"} published · {result.errors} error
              {result.errors === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="focus-ring"
              onClick={() => setResult(null)}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset
            </Button>
          </div>
          <ul className="glass-card divide-border/60 scrollbar-slim max-h-96 divide-y overflow-y-auto">
            {result.report.map((item, index) => (
              <li key={`${item.file}-${index}`} className="flex items-start gap-2.5 px-4 py-3">
                {item.error ? (
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                ) : (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.file}</span>
                  {item.error ? (
                    <span className="text-destructive block text-xs">{item.error}</span>
                  ) : (
                    <span className="text-muted-foreground block text-xs">
                      ✓ {item.inserted} {item.kind === "note" ? "note" : "question"}
                      {item.inserted === 1 ? "" : "s"} inserted
                    </span>
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
