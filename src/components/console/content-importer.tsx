"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Loader2,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — bulk content import (questions & notes CSV). Same column
 * contract as the lecturer CSV importer, but authenticated with the
 * operations session and written with the service-role client, so the
 * operator does not need a staff account.
 *
 * Three paths in: paste CSV, upload a .csv file, or the AI converter —
 * drop a PDF / Word / PowerPoint / Excel export (or paste raw material)
 * and the AI turns it into contract-valid CSV for review before import.
 */

interface ImportResult {
  inserted: number;
  errors: { row: number; error: string }[];
}

interface AiConversion {
  csv: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  problems: string[];
}

const QUESTION_HEADER =
  "topic,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags";
const NOTE_HEADER = "title,topic,summary,tags,status,reading_minutes,exam_critical,content";

const QUESTION_EXAMPLE =
  'glycolysis,main,medium,mcq,"Which enzyme catalyses the committed step of glycolysis?",Hexokinase,PFK-1,,,B,"PFK-1 catalyses the first committed step",1,regulation';
const NOTE_EXAMPLE =
  'Glycolysis overview,glycolysis,"The ten steps, enzymes and regulation.",biochemistry;metabolism,published,7,false,"Glycolysis converts one glucose into two pyruvate molecules…"';

const MAX_ROWS = 500;
const MAX_MATERIAL_CHARS = 120_000;

const AI_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xlsm,.txt,.md,.tsv,.rtf,.json";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export function ContentImporter() {
  const base = useConsoleBase();
  const inputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"questions" | "notes">("questions");
  const [csvText, setCsvText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // AI converter state.
  const [material, setMaterial] = useState("");
  const [materialInfo, setMaterialInfo] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [count, setCount] = useState(15);
  const [conversion, setConversion] = useState<AiConversion | null>(null);
  const [reviewText, setReviewText] = useState("");

  const header = kind === "questions" ? QUESTION_HEADER : NOTE_HEADER;
  const example = kind === "questions" ? QUESTION_EXAMPLE : NOTE_EXAMPLE;

  const importRows = async (rows: Record<string, string>[]) => {
    if (rows.length === 0) {
      toast.error("No data rows found", {
        description: "Check that your CSV has a header row and at least one entry.",
      });
      return;
    }
    const bounded = rows.slice(0, MAX_ROWS);
    if (rows.length > MAX_ROWS) {
      toast.info(`Only the first ${MAX_ROWS} rows were imported`, {
        description: `${rows.length - MAX_ROWS} rows were skipped — split larger files.`,
      });
    }

    setPending(true);
    setResult(null);
    try {
      const response = await fetch(consoleUrl(base, "api/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, rows: bounded }),
      });
      if (!response.ok) {
        toast.error("Import failed", {
          description: await readError(response, "The console rejected the import."),
        });
        return;
      }
      const data = (await response.json()) as ImportResult;
      setResult(data);
      if (data.inserted === 0) {
        toast.error(`No ${kind} imported`, {
          description:
            data.errors.length > 0 ? `${data.errors.length} row(s) had problems — see below.` : undefined,
        });
      } else {
        toast.success(
          `${data.inserted} ${kind === "questions" ? "question" : "note"}${
            data.inserted === 1 ? "" : "s"
          } imported${data.errors.length > 0 ? ` · ${data.errors.length} row(s) skipped` : ""}`,
        );
      }
    } catch {
      toast.error("Import failed", { description: "Network error — please try again." });
    } finally {
      setPending(false);
    }
  };

  const importText = (text: string) => {
    if (!text.trim()) {
      toast.error("Paste some CSV rows first");
      return;
    }
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0 && (parsed.data ?? []).length === 0) {
      toast.error("That CSV could not be parsed", { description: parsed.errors[0]?.message });
      return;
    }
    void importRows(parsed.data ?? []);
  };

  const extractFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      toast.error("CSV files don't need the AI — use the Upload .csv tab to import directly");
      return;
    }
    setExtracting(true);
    setMaterialInfo(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(consoleUrl(base, "api/import/extract"), {
        method: "POST",
        body,
      });
      if (!response.ok) {
        toast.error("Could not read that file", {
          description: await readError(response, "Extraction failed."),
        });
        return;
      }
      const data = (await response.json()) as {
        text: string;
        meta: { label: string; characters: number; truncated: boolean; pages?: number; slides?: number; sheets?: number };
      };
      setMaterial(data.text);
      const bits = [data.meta.label];
      if (data.meta.pages) bits.push(`${data.meta.pages} pages`);
      if (data.meta.slides) bits.push(`${data.meta.slides} slides`);
      if (data.meta.sheets) bits.push(`${data.meta.sheets} sheets`);
      bits.push(`${data.meta.characters.toLocaleString()} characters`);
      if (data.meta.truncated) bits.push("truncated");
      setMaterialInfo(`${bits.join(" · ")} extracted`);
      toast.success("Document text extracted — review it, then convert with AI");
    } catch {
      toast.error("Extraction failed", { description: "Network error — please try again." });
    } finally {
      setExtracting(false);
    }
  };

  const convertWithAi = async () => {
    if (material.trim().length < 40) {
      toast.error("Add material first", {
        description: "Upload a document or paste at least a paragraph of text.",
      });
      return;
    }
    setConverting(true);
    setConversion(null);
    try {
      const response = await fetch(consoleUrl(base, "api/import/ai"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: kind, text: material.slice(0, MAX_MATERIAL_CHARS), count }),
      });
      if (!response.ok) {
        toast.error("AI conversion failed", {
          description: await readError(response, "The AI gateway rejected the request."),
        });
        return;
      }
      const data = (await response.json()) as AiConversion;
      setConversion(data);
      setReviewText(data.csv);
      if (data.rowCount === 0) {
        toast.error("The AI returned no CSV rows", {
          description: "Try more structured material, or lower the target count.",
        });
      } else {
        toast.success(
          `${data.validCount} valid ${kind === "questions" ? "question" : "note"} row${
            data.validCount === 1 ? "" : "s"
          } generated — review below, then import`,
        );
      }
    } catch {
      toast.error("AI conversion failed", { description: "Network error — please try again." });
    } finally {
      setConverting(false);
    }
  };

  const resetAi = () => {
    setMaterial("");
    setMaterialInfo(null);
    setConversion(null);
    setReviewText("");
  };

  return (
    <div className="space-y-4">
      <Tabs
        value={kind}
        onValueChange={(value) => {
          setKind(value as "questions" | "notes");
          setResult(null);
          setConversion(null);
          setReviewText("");
        }}
        className="gap-4"
      >
        <TabsList>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="space-y-3">
          <p className="text-muted-foreground text-sm">
            One question per row — published straight into the exam bank. Columns:{" "}
            <span className="font-mono">{QUESTION_HEADER}</span> (option_a–d, explanation, marks
            and tags optional; marks default to 1; zone is cat1, cat2 or main; type is mcq,
            short_answer, long_answer or structured).
          </p>
        </TabsContent>
        <TabsContent value="notes" className="space-y-3">
          <p className="text-muted-foreground text-sm">
            One note per row — body text goes in the <span className="font-mono">content</span>{" "}
            column (Markdown supported). Columns:{" "}
            <span className="font-mono">{NOTE_HEADER}</span> (summary, tags, status, reading_minutes
            and exam_critical optional; status is published or draft, defaults to published).
          </p>
        </TabsContent>
      </Tabs>

      <Tabs defaultValue="paste" className="gap-4">
        <TabsList>
          <TabsTrigger value="paste">Paste CSV</TabsTrigger>
          <TabsTrigger value="upload">Upload .csv</TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="size-3.5" aria-hidden />
            AI convert
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="space-y-3">
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={`${header}\n${example}`}
            className="min-h-44 font-mono text-xs"
            aria-label="Paste CSV rows"
          />
          <p className="text-muted-foreground text-xs">
            Header row required · the <span className="font-mono">topic</span> column takes a topic
            slug or exact title from the CMS tab · up to {MAX_ROWS} rows per import.
          </p>
          <Button
            type="button"
            disabled={pending}
            className="focus-ring"
            onClick={() => importText(csvText)}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {pending ? "Importing…" : `Import ${kind}`}
          </Button>
        </TabsContent>

        <TabsContent value="upload" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              id="import-csv-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!file.name.toLowerCase().endsWith(".csv")) {
                  toast.error("Only .csv files are supported here", {
                    description: "Use the AI convert tab for PDF, Word, PowerPoint or Excel files.",
                  });
                  return;
                }
                const text = await file.text();
                importText(text);
              }}
            />
            <label htmlFor="import-csv-file" className="sr-only">
              Choose a CSV file to import
            </label>
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileSpreadsheet className="size-4" aria-hidden />
              )}
              Browse .csv file
            </Button>
            <p className="text-muted-foreground text-xs">
              First row must be the header · up to {MAX_ROWS} rows per import.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Drop a document in the format it&apos;s already in — PDF, Word, PowerPoint, Excel or
            plain text — or paste/write the material below. The AI converts it into the{" "}
            {kind === "questions" ? "question" : "note"} CSV contract for review before anything is
            imported.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={materialInputRef}
              id="import-material-file"
              type="file"
              accept={AI_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void extractFile(file);
              }}
            />
            <label htmlFor="import-material-file" className="sr-only">
              Choose a document to convert
            </label>
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              disabled={extracting || converting}
              onClick={() => materialInputRef.current?.click()}
            >
              {extracting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileText className="size-4" aria-hidden />
              )}
              {extracting ? "Reading…" : "Browse document"}
            </Button>
            {materialInfo ? (
              <p className="text-muted-foreground text-xs">{materialInfo}</p>
            ) : (
              <p className="text-muted-foreground text-xs">
                .pdf · .docx · .pptx · .xlsx · .txt · .md — up to 12 MB
              </p>
            )}
          </div>

          <Textarea
            value={material}
            onChange={(event) => setMaterial(event.target.value)}
            placeholder={
              kind === "questions"
                ? "Paste lecture material, a summary sheet, or write what you want questions about…"
                : "Paste lecture material, an outline, or write what the notes should cover…"
            }
            className="min-h-40 text-sm"
            aria-label="Material for the AI to convert"
          />

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="ai-count"
              className="text-muted-foreground text-sm font-medium"
            >
              Target {kind === "questions" ? "questions" : "notes"}
            </label>
            <select
              id="ai-count"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="border-border bg-card focus-ring h-9 rounded-lg border px-2.5 text-sm"
              disabled={converting}
            >
              {[5, 10, 15, 20, 30, 40].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Button
              type="button"
              className="focus-ring ml-auto"
              disabled={converting || extracting}
              onClick={() => void convertWithAi()}
            >
              {converting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {converting ? "Converting…" : `Convert to ${kind === "questions" ? "questions" : "notes"} CSV`}
            </Button>
            {material || conversion ? (
              <Button type="button" variant="ghost" onClick={resetAi} disabled={converting}>
                Clear
              </Button>
            ) : null}
          </div>

          {conversion ? (
            <div className="space-y-3">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {conversion.validCount > 0 ? (
                  <CheckCircle2
                    className="size-4 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                ) : (
                  <XCircle className="text-destructive size-4" aria-hidden />
                )}
                {conversion.rowCount} row{conversion.rowCount === 1 ? "" : "s"} generated ·{" "}
                {conversion.validCount} valid · {conversion.invalidCount} invalid
              </p>
              {conversion.problems.length > 0 ? (
                <ul className="glass-card space-y-1 p-3 text-xs">
                  {conversion.problems.map((problem) => (
                    <li key={problem} className="text-muted-foreground">
                      {problem}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Textarea
                value={reviewText}
                onChange={(event) => setReviewText(event.target.value)}
                className="min-h-56 font-mono text-xs"
                aria-label="Review the generated CSV"
              />
              <p className="text-muted-foreground text-xs">
                Edit anything above before importing — the topic column must still match a CMS
                topic.
              </p>
              <Button
                type="button"
                disabled={pending || conversion.rowCount === 0}
                className="focus-ring"
                onClick={() => importText(reviewText)}
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                {pending ? "Importing…" : `Import ${kind}`}
              </Button>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {result ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            {result.inserted > 0 ? (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="text-destructive size-4" aria-hidden />
            )}
            {result.inserted} {kind === "questions" ? "question" : "note"}
            {result.inserted === 1 ? "" : "s"} imported · {result.errors.length} error
            {result.errors.length === 1 ? "" : "s"}
          </p>
          {result.errors.length > 0 ? (
            <ul className="glass-card divide-border/60 scrollbar-slim max-h-72 divide-y overflow-y-auto">
              {result.errors.map((item) => (
                <li
                  key={`${item.row}-${item.error}`}
                  className="flex items-start gap-2.5 px-4 py-2.5 text-sm"
                >
                  <XCircle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-medium">Row {item.row}:</span>{" "}
                    <span className="text-muted-foreground">{item.error}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
