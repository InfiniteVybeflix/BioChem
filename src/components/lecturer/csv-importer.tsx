"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface CsvImportResult {
  inserted: number;
  errors: { row: number; error: string }[];
}

const EXAMPLE_LINE =
  "topic,unit,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags,answers_hidden";

const MAX_ROWS = 500;

/**
 * CSV question importer — paste rows or upload a .csv. Parses with papaparse
 * (header row) and posts the rows to /api/content/csv, then renders the
 * per-row results.
 */
export function CsvImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const importRows = async (rows: unknown[]) => {
    if (rows.length === 0) {
      toast.error("No data rows found", {
        description: "Check that your CSV has a header row and at least one question.",
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
    try {
      const response = await fetch("/api/content/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: bounded }),
        credentials: "include",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Import failed";
        toast.error("CSV import failed", { description: message });
        return;
      }
      const data = payload as CsvImportResult;
      setResult(data);
      if (data.inserted === 0) {
        toast.error("No questions imported", {
          description:
            data.errors.length > 0
              ? `${data.errors.length} row(s) had problems — see below.`
              : undefined,
        });
      } else {
        toast.success(
          `${data.inserted} question${data.inserted === 1 ? "" : "s"} imported${
            data.errors.length > 0 ? ` · ${data.errors.length} row(s) skipped` : ""
          }`,
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
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0 && (parsed.data ?? []).length === 0) {
      toast.error("That CSV could not be parsed", { description: parsed.errors[0]?.message });
      return;
    }
    void importRows(parsed.data ?? []);
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="paste" className="gap-4">
        <TabsList>
          <TabsTrigger value="paste">Paste CSV</TabsTrigger>
          <TabsTrigger value="upload">Upload .csv</TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="space-y-3">
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={`topic,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags\nglycolysis,cat2,medium,mcq,"Which enzyme catalyses the committed step of glycolysis?",Hexokinase,Phosphofructokinase-1,,,B,"PFK-1 catalyses the first irreversible step",1,regulation`}
            className="min-h-44 font-mono text-xs"
            aria-label="Paste CSV rows"
          />
          <p className="text-muted-foreground text-xs">
            Header row required — columns: <span className="font-mono break-all">{EXAMPLE_LINE}</span>{" "}
            (unit, option_a–d and tags are optional; marks default to 1; unit takes a unit code like
            BIO205 or the exact unit name and files the topic under that unit; set{" "}
            <span className="font-mono">answers_hidden</span> to “true” to withhold answers until
            you release them from the Marking tab).
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
            {pending ? "Importing…" : "Import questions"}
          </Button>
        </TabsContent>

        <TabsContent value="upload" className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (!file.name.toLowerCase().endsWith(".csv")) {
                  toast.error("Only .csv files are supported");
                  return;
                }
                const text = await file.text();
                importText(text);
              }}
            />
            <label htmlFor="csv-file" className="sr-only">
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
      </Tabs>

      {result ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            {result.inserted > 0 ? (
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
            ) : (
              <XCircle className="text-destructive size-4" aria-hidden />
            )}
            {result.inserted} question{result.inserted === 1 ? "" : "s"} imported ·{" "}
            {result.errors.length} error
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
