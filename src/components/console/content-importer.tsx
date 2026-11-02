"use client";

import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderTree,
  Layers,
  Loader2,
  MapPin,
  Play,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — bulk content import (questions & notes CSV). Same column
 * contract as the lecturer CSV importer, but authenticated with the
 * operations session and written with the service-role client, so the
 * operator does not need a staff account.
 *
 * Three paths in: paste CSV, upload a .csv file, or the AI converter —
 * drop one (or MANY, staged as a queue) PDF / Word / PowerPoint /
 * Excel exports (or paste raw material) and the AI turns each into
 * contract-valid CSV for review before import. Rows can be aimed at a
 * topic, a course unit (BIO 205…), a zone, a school — and questions
 * can be published with their answers hidden until lecturers release
 * them.
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
  detected?: {
    subject: string | null;
    unitCode: string | null;
    unitName: string | null;
    school: string | null;
  };
}

const QUESTION_HEADER =
  "topic,unit,zone,difficulty,type,stem,option_a,option_b,option_c,option_d,answer,explanation,marks,tags";
const NOTE_HEADER = "title,topic,unit,summary,tags,status,reading_minutes,exam_critical,content";

const QUESTION_EXAMPLE =
  'glycolysis,BIO205,main,medium,mcq,"Which enzyme catalyses the committed step of glycolysis?",Hexokinase,PFK-1,,,B,"PFK-1 catalyses the first committed step",1,regulation';
const NOTE_EXAMPLE =
  'Glycolysis overview,glycolysis,BIO205,"The ten steps, enzymes and regulation.",biochemistry;metabolism,published,7,false,"Glycolysis converts one glucose into two pyruvate molecules…"';

const MAX_ROWS = 500;
const MAX_MATERIAL_CHARS = 120_000;
const MAX_BULK_FILES = 20;

const AI_ACCEPT = ".pdf,.docx,.pptx,.xlsx,.xlsm,.txt,.md,.tsv,.rtf,.json";

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export interface ImporterTopic {
  slug: string;
  title: string;
  zone: string;
}

export interface ImporterSchool {
  id: string;
  name: string;
}

export interface ImporterUnit {
  id: string;
  code: string;
  name: string;
  school_id: string;
  year: number;
  semester: number | null;
}

const CUSTOM_TOPIC = "__custom";
const AI_MATCH = "__ai";

type QuestionTypeChoice = "mix" | "mcq" | "short_answer" | "long_answer" | "structured";
type AnswerMode = "visible" | "hidden" | "scheduled";

type StagedStatus =
  | "waiting"
  | "extracting"
  | "converting"
  | "ready"
  | "importing"
  | "done"
  | "failed";

interface StagedFile {
  id: string;
  name: string;
  status: StagedStatus;
  conversion?: AiConversion;
  csv?: string;
  inserted?: number;
  error?: string;
}

const STATUS_LABEL: Record<StagedStatus, string> = {
  waiting: "Waiting",
  extracting: "Reading…",
  converting: "Converting with AI…",
  ready: "Ready to import",
  importing: "Importing…",
  done: "Imported",
  failed: "Failed",
};

/** Save generated CSV locally — "BOT201 notes.pdf" → "BOT201 notes.csv". */
function downloadCsv(sourceName: string, csv: string): void {
  const name = `${sourceName.replace(/\.[^.]+$/, "") || "converted"}.csv`;
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  toast.success(`Saved ${name}`);
}

export function ContentImporter({
  topics = [],
  schools = [],
  units = [],
}: {
  /** Existing CMS topics — offered as the AI converter's destination. */
  topics?: ImporterTopic[];
  /** Schools the operator can scope imported topics to. */
  schools?: ImporterSchool[];
  /** Course units — the destination the content is filed into. */
  units?: ImporterUnit[];
}) {
  const base = useConsoleBase();
  const inputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"questions" | "notes">("questions");
  const [csvText, setCsvText] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // AI converter state.
  const [material, setMaterial] = useState("");
  const [materialInfo, setMaterialInfo] = useState<string | null>(null);
  const [materialFileName, setMaterialFileName] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [count, setCount] = useState(15);
  const [conversion, setConversion] = useState<AiConversion | null>(null);
  const [reviewText, setReviewText] = useState("");

  // Bulk staging queue — many documents, processed strictly one at a time.
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [queueRunning, setQueueRunning] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [autoImport, setAutoImport] = useState(false);

  /** The queue's source of truth — file handles never live in React state. */
  const queueRef = useRef<{ item: StagedFile; file: File }[]>([]);
  const runningRef = useRef(false);
  const autoImportRef = useRef(false);
  autoImportRef.current = autoImport;
  const kindRef = useRef(kind);
  kindRef.current = kind;

  // Content destination — where generated/imported rows land.
  const [topicChoice, setTopicChoice] = useState<string>(""); // "" / AI_MATCH = AI matches, slug, or CUSTOM_TOPIC
  const [customTopic, setCustomTopic] = useState("");
  const [destZoneRaw, setDestZoneRaw] = useState<string>(""); // "__keep" = keep row zones
  const [destSchool, setDestSchool] = useState<string>(""); // "" / "__all" = all schools
  const [destUnitId, setDestUnitId] = useState<string>(""); // "" = row unit / AI detection
  const [unitYear, setUnitYear] = useState<string>("1"); // year for auto-created units
  const [autoCreate, setAutoCreate] = useState(true);

  // Questions-only controls.
  const [questionType, setQuestionType] = useState<QuestionTypeChoice>("mix");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("visible");
  const [answerReleaseAt, setAnswerReleaseAt] = useState("");

  const destTopic =
    topicChoice === CUSTOM_TOPIC
      ? customTopic.trim()
      : topicChoice === "" || topicChoice === AI_MATCH
        ? ""
        : topicChoice;
  const destZone = destZoneRaw === "" || destZoneRaw === "__keep" ? "" : destZoneRaw;
  const destUnit = units.find((unit) => unit.id === destUnitId) ?? null;

  const header = kind === "questions" ? QUESTION_HEADER : NOTE_HEADER;
  const example = kind === "questions" ? QUESTION_EXAMPLE : NOTE_EXAMPLE;

  // Units grouped by school → year for the destination picker.
  const unitGroups = useMemo(() => {
    const bySchool = new Map<string, Map<number, ImporterUnit[]>>();
    for (const unit of units) {
      let years = bySchool.get(unit.school_id);
      if (!years) {
        years = new Map<number, ImporterUnit[]>();
        bySchool.set(unit.school_id, years);
      }
      const list = years.get(unit.year) ?? [];
      list.push(unit);
      years.set(unit.year, list);
    }
    return [...bySchool.entries()].map(([schoolId, yearsMap]) => ({
      schoolId,
      schoolName:
        schools.find((school) => school.id === schoolId)?.name ??
        units.find((unit) => unit.school_id === schoolId)?.code ??
        "School",
      years: [...yearsMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, list]) => ({
          year,
          units: [...list].sort((a, b) => a.code.localeCompare(b.code)),
        })),
    }));
  }, [units, schools]);

  const pickUnit = (value: string) => {
    setDestUnitId(value);
    // Choosing a unit pins its school so auto-created topics land in scope.
    if (value && value !== AI_MATCH) {
      const unit = units.find((entry) => entry.id === value);
      if (unit && (!destSchool || destSchool === "__all")) {
        setDestSchool(unit.school_id);
      }
    }
  };

  const importBodyExtras = () => ({
    ...(destZone ? { defaultZone: destZone } : {}),
    ...(destSchool && destSchool !== "__all" ? { schoolId: destSchool } : {}),
    ...(destUnit ? { defaultUnitId: destUnit.id } : {}),
    autoCreateUnits: true,
    unitYear: Number(unitYear) || 1,
    ...(kind === "questions" && answerMode !== "visible"
      ? {
          answerVisibility: {
            mode: "hidden" as const,
            ...(answerMode === "scheduled" && answerReleaseAt
              ? { releaseAt: new Date(answerReleaseAt).toISOString() }
              : {}),
          },
        }
      : {}),
  });

  const importRows = async (rows: Record<string, string>[], silentToast = false) => {
    if (rows.length === 0) {
      if (!silentToast) {
        toast.error("No data rows found", {
          description: "Check that your CSV has a header row and at least one entry.",
        });
      }
      return null;
    }
    const bounded = rows.slice(0, MAX_ROWS);
    if (rows.length > MAX_ROWS && !silentToast) {
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
        body: JSON.stringify({
          type: kind,
          rows: bounded,
          autoCreateTopics: autoCreate,
          ...importBodyExtras(),
        }),
      });
      if (!response.ok) {
        const message = await readError(response, "The console rejected the import.");
        if (silentToast) {
          throw new Error(message);
        }
        toast.error("Import failed", { description: message });
        return null;
      }
      const data = (await response.json()) as ImportResult;
      if (!silentToast) {
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
      }
      return data;
    } catch (error) {
      if (silentToast) throw error;
      toast.error("Import failed", { description: "Network error — please try again." });
      return null;
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

  const convertBody = (text: string) => ({
    type: kind,
    text: text.slice(0, MAX_MATERIAL_CHARS),
    count,
    ...(destTopic ? { topic: destTopic } : {}),
    ...(destUnit ? { unit: `${destUnit.code} ${destUnit.name}`.trim() } : {}),
    ...(destZone ? { zone: destZone } : {}),
    ...(kind === "questions" ? { questionType } : {}),
    ...(destSchool && destSchool !== "__all"
      ? { school: schools.find((school) => school.id === destSchool)?.name }
      : {}),
  });

  const convertText = async (text: string): Promise<AiConversion> => {
    const response = await fetch(consoleUrl(base, "api/import/ai"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(convertBody(text)),
    });
    if (!response.ok) {
      throw new Error(await readError(response, "The AI gateway rejected the request."));
    }
    return (await response.json()) as AiConversion;
  };

  const extractFileText = async (file: File): Promise<string> => {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(consoleUrl(base, "api/import/extract"), {
      method: "POST",
      body,
    });
    if (!response.ok) {
      throw new Error(await readError(response, "Extraction failed."));
    }
    const data = (await response.json()) as { text: string };
    return data.text;
  };

  const extractFile = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".csv")) {
      toast.error("CSV files don't need the AI — use the Upload .csv tab to import directly");
      return;
    }
    setExtracting(true);
    setMaterialInfo(null);
    setMaterialFileName(null);
    try {
      const text = await extractFileText(file);
      setMaterial(text);
      setMaterialFileName(file.name);
      setMaterialInfo(`${file.name} — text extracted. Review it, then convert with AI.`);
      toast.success("Document text extracted — review it, then convert with AI");
    } catch (error) {
      toast.error("Could not read that file", {
        description: error instanceof Error ? error.message : "Extraction failed.",
      });
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
      const data = await convertText(material);
      setConversion(data);
      setReviewText(data.csv);
      if (data.rowCount === 0) {
        toast.error("The AI returned no rows", {
          description: "Try more structured material, or lower the target count.",
        });
      } else {
        toast.success(
          `${data.validCount} valid ${kind === "questions" ? "question" : "note"} row${
            data.validCount === 1 ? "" : "s"
          } generated — review below, then import`,
        );
      }
    } catch (error) {
      toast.error("AI conversion failed", {
        description: error instanceof Error ? error.message : "Network error — please try again.",
      });
    } finally {
      setConverting(false);
    }
  };

  const resetAi = () => {
    setMaterial("");
    setMaterialInfo(null);
    setMaterialFileName(null);
    setConversion(null);
    setReviewText("");
  };

  // ---------------- Bulk staging queue ----------------

  const patchEntry = (id: string, patch: Partial<StagedFile>) => {
    const entry = queueRef.current.find((candidate) => candidate.item.id === id);
    if (entry) entry.item = { ...entry.item, ...patch };
    setStaged((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const processOne = async (id: string): Promise<void> => {
    const entry = queueRef.current.find((candidate) => candidate.item.id === id);
    if (!entry) return;
    try {
      patchEntry(id, { status: "extracting", error: undefined });
      const lower = entry.file.name.toLowerCase();
      const text = /\.(txt|md|tsv|json|csv)$/.test(lower)
        ? await entry.file.text()
        : await extractFileText(entry.file);
      patchEntry(id, { status: "converting" });
      const conversion = await convertText(text);
      patchEntry(id, {
        status: conversion.rowCount > 0 ? "ready" : "failed",
        conversion,
        csv: conversion.csv,
        error:
          conversion.rowCount > 0
            ? undefined
            : "The AI returned no rows for this document — try converting it manually below.",
      });
    } catch (error) {
      patchEntry(id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Processing failed",
      });
    }
  };

  const importOne = async (id: string): Promise<void> => {
    const entry = queueRef.current.find((candidate) => candidate.item.id === id);
    if (!entry?.item.csv) return;
    const parsed = Papa.parse<Record<string, string>>(entry.item.csv, {
      header: true,
      skipEmptyLines: true,
    });
    const rows = parsed.data ?? [];
    if (rows.length === 0) {
      patchEntry(id, { status: "failed", error: "No rows to import." });
      return;
    }
    patchEntry(id, { status: "importing" });
    try {
      const response = await fetch(consoleUrl(base, "api/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: kindRef.current,
          rows: rows.slice(0, MAX_ROWS),
          autoCreateTopics: autoCreate,
          ...importBodyExtras(),
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "The console rejected the import."));
      }
      const data = (await response.json()) as ImportResult;
      patchEntry(id, { status: "done", inserted: data.inserted });
    } catch (error) {
      patchEntry(id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  };

  /** Works the queue strictly one file at a time: extract → convert → (auto-)import. */
  const runQueue = async (): Promise<void> => {
    if (runningRef.current) return;
    runningRef.current = true;
    setQueueRunning(true);
    try {
      for (;;) {
        const next = queueRef.current.find((candidate) => candidate.item.status === "waiting");
        if (!next) break;
        await processOne(next.item.id);
        if (autoImportRef.current) {
          const target = queueRef.current.find((candidate) => candidate.item.id === next.item.id);
          if (target?.item.status === "ready") {
            await importOne(next.item.id);
          }
        }
      }
    } finally {
      runningRef.current = false;
      setQueueRunning(false);
      const items = queueRef.current.map((candidate) => candidate.item);
      const done = items.filter((item) => item.status === "done").length;
      const failed = items.filter((item) => item.status === "failed").length;
      if (done + failed > 0) {
        toast.success(
          `Queue finished — ${done} imported${failed > 0 ? `, ${failed} failed` : ""}.`,
        );
      }
    }
  };

  const stageFiles = (files: File[]) => {
    const accepted = files.filter((file) => !file.name.toLowerCase().endsWith(".csv"));
    const rejected = files.length - accepted.length;
    if (rejected > 0) {
      toast.info(`${rejected} CSV file${rejected === 1 ? "" : "s"} skipped`, {
        description: "CSV files import directly from the Upload .csv tab — no AI needed.",
      });
    }
    const room = MAX_BULK_FILES - queueRef.current.length;
    const queue = accepted.slice(0, Math.max(room, 0));
    if (accepted.length > queue.length) {
      toast.info(`Up to ${MAX_BULK_FILES} documents per batch — extra files were dropped.`);
    }
    if (queue.length === 0) return;
    const entries = queue.map((file) => ({
      item: {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        status: "waiting" as StagedStatus,
      },
      file,
    }));
    queueRef.current = [...queueRef.current, ...entries];
    setStaged(queueRef.current.map((entry) => entry.item));
    void runQueue();
  };

  const importAllReady = async () => {
    setBulkBusy(true);
    try {
      for (;;) {
        const next = queueRef.current.find((candidate) => candidate.item.status === "ready");
        if (!next) break;
        await importOne(next.item.id);
      }
    } finally {
      setBulkBusy(false);
      const remaining = queueRef.current.filter((candidate) => candidate.item.status === "ready").length;
      if (remaining === 0) toast.success("All ready documents imported.");
    }
  };

  const retryOne = (id: string) => {
    patchEntry(id, { status: "waiting", error: undefined });
    void runQueue();
  };

  const removeStaged = (id: string) => {
    if (runningRef.current) return;
    queueRef.current = queueRef.current.filter((candidate) => candidate.item.id !== id);
    setStaged(queueRef.current.map((entry) => entry.item));
  };

  const clearDone = () => {
    queueRef.current = queueRef.current.filter((candidate) => candidate.item.status !== "done");
    setStaged(queueRef.current.map((entry) => entry.item));
  };

  const readyCount = staged.filter((item) => item.status === "ready").length;
  const doneCount = staged.filter((item) => item.status === "done").length;
  const failedCount = staged.filter((item) => item.status === "failed").length;
  const waitingCount = staged.filter(
    (item) => item.status === "waiting" || item.status === "extracting" || item.status === "converting",
  ).length;
  const inFlight = queueRunning || bulkBusy;

  const detectedLine = (detected: AiConversion["detected"]): string | null => {
    if (!detected) return null;
    const bits: string[] = [];
    if (detected.subject) bits.push(detected.subject);
    if (detected.unitCode || detected.unitName) {
      bits.push(
        `Unit ${detected.unitCode ?? "?"}${detected.unitName ? ` — ${detected.unitName}` : ""}`,
      );
    }
    if (detected.school) bits.push(detected.school);
    return bits.length > 0 ? bits.join(" · ") : null;
  };

  return (
    <div className="min-w-0 space-y-4">
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
        <TabsList className="flex-wrap">
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" className="min-w-0 space-y-3">
          <p className="text-muted-foreground text-sm">
            One question per row — published straight into the exam bank. Columns:{" "}
            <span className="font-mono break-all">{QUESTION_HEADER}</span> (unit, option_a–d,
            explanation, marks and tags optional; marks default to 1; zone is cat1, cat2 or main;
            type is mcq, short_answer, long_answer or structured; unit takes a unit code like
            BIO205 or the exact unit name).
          </p>
        </TabsContent>
        <TabsContent value="notes" className="min-w-0 space-y-3">
          <p className="text-muted-foreground text-sm">
            One note per row — body text goes in the <span className="font-mono">content</span>{" "}
            column (Markdown supported). Columns:{" "}
            <span className="font-mono break-all">{NOTE_HEADER}</span> (unit, summary, tags, status,
            reading_minutes and exam_critical optional; status is published or draft, defaults to
            published; unit takes a unit code like BIO205 or the exact unit name).
          </p>
        </TabsContent>
      </Tabs>

      {/* ---------- Content destination — applies to every path ---------- */}
      <div className="glass-card min-w-0 space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="text-primary size-4" aria-hidden />
              Where this content goes
            </h3>
            <p className="text-muted-foreground mt-1 text-xs">
              Pick a topic, course unit, zone and school — the AI converter files every generated
              row there and the CSV importer follows the same destination. Leave the unit open and
              the AI files rows by the unit it detects in the material (creating the unit when it
              names one you don't have yet).
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <Switch
              id="import-auto-create"
              checked={autoCreate}
              onCheckedChange={setAutoCreate}
              aria-label="Auto-create missing topics"
            />
            <Label htmlFor="import-auto-create" className="text-xs font-medium">
              Auto-create missing topics
            </Label>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="import-dest-unit">Course unit</Label>
            <Select value={destUnitId || AI_MATCH} onValueChange={pickUnit}>
              <SelectTrigger id="import-dest-unit" aria-label="Choose the destination unit">
                <SelectValue placeholder="AI detects from material" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AI_MATCH}>
                  <span className="text-muted-foreground">AI detects from material</span>
                </SelectItem>
                {unitGroups.map((group) => (
                  <SelectGroup key={group.schoolId}>
                    <SelectLabel>{group.schoolName}</SelectLabel>
                    {group.years.flatMap((entry) =>
                      entry.units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.code} — {unit.name}
                          <span className="text-muted-foreground ml-1 text-[10px]">
                            Yr {unit.year}
                          </span>
                        </SelectItem>
                      )),
                    )}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="import-dest-topic">Topic</Label>
            <Select value={topicChoice || AI_MATCH} onValueChange={setTopicChoice}>
              <SelectTrigger id="import-dest-topic" aria-label="Choose the destination topic">
                <SelectValue placeholder="AI matches from CMS topics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AI_MATCH}>
                  <span className="text-muted-foreground">AI matches from CMS topics</span>
                </SelectItem>
                {topics.map((topic) => (
                  <SelectItem key={topic.slug} value={topic.slug}>
                    {topic.title}{" "}
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {topic.slug}
                    </span>
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_TOPIC}>＋ New topic (type a name)…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="import-dest-zone">Exam zone</Label>
            <Select value={destZoneRaw || "__keep"} onValueChange={setDestZoneRaw}>
              <SelectTrigger id="import-dest-zone" aria-label="Choose the exam zone">
                <SelectValue placeholder="Keep row zones / AI decides" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep">
                  <span className="text-muted-foreground">Keep row zones / AI decides</span>
                </SelectItem>
                <SelectItem value="cat1">CAT 1</SelectItem>
                <SelectItem value="cat2">CAT 2</SelectItem>
                <SelectItem value="main">Main exam</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="import-dest-school">School</Label>
            <Select
              value={destSchool || "__all"}
              onValueChange={(value) => setDestSchool(value === "__all" ? "" : value)}
            >
              <SelectTrigger id="import-dest-school" aria-label="Choose the school">
                <SelectValue placeholder="All schools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">
                  <span className="text-muted-foreground">All schools</span>
                </SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="import-unit-year">Year for new units</Label>
            <Select value={unitYear} onValueChange={setUnitYear}>
              <SelectTrigger
                id="import-unit-year"
                aria-label="Choose the year for newly created units"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    Year {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {topicChoice === CUSTOM_TOPIC ? (
          <div className="space-y-1.5">
            <Label htmlFor="import-custom-topic">New topic name</Label>
            <Input
              id="import-custom-topic"
              value={customTopic}
              maxLength={160}
              placeholder="e.g. Lipid metabolism"
              onChange={(event) => setCustomTopic(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Created automatically on import (with “auto-create” on) — or beforehand in the CMS{" "}
              <span className="inline-flex items-center gap-1">
                <FolderTree className="size-3" aria-hidden /> Topics
              </span>{" "}
              tab.
            </p>
          </div>
        ) : null}

        {kind === "questions" ? (
          <div className="grid min-w-0 gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="import-question-type">Question format</Label>
              <Select
                value={questionType}
                onValueChange={(value) => setQuestionType(value as QuestionTypeChoice)}
              >
                <SelectTrigger id="import-question-type" aria-label="Choose the question format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mix">Mix — AI picks per question</SelectItem>
                  <SelectItem value="mcq">MCQ only (A–D options)</SelectItem>
                  <SelectItem value="short_answer">Short answer</SelectItem>
                  <SelectItem value="long_answer">Essay (long answer)</SelectItem>
                  <SelectItem value="structured">Structured</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                The AI reads the whole document and generates questions in the format you pick —
                each with a model answer and explanation.
              </p>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="import-answer-mode">Answer visibility</Label>
              <Select value={answerMode} onValueChange={(value) => setAnswerMode(value as AnswerMode)}>
                <SelectTrigger id="import-answer-mode" aria-label="Choose answer visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">Answers visible immediately</SelectItem>
                  <SelectItem value="hidden">Hidden — lecturers release manually</SelectItem>
                  <SelectItem value="scheduled">Hidden until a date &amp; time</SelectItem>
                </SelectContent>
              </Select>
              {answerMode === "scheduled" ? (
                <Input
                  type="datetime-local"
                  aria-label="Answer release moment"
                  value={answerReleaseAt}
                  onChange={(event) => setAnswerReleaseAt(event.target.value)}
                />
              ) : (
                <p className="text-muted-foreground text-xs">
                  Hidden answers open from the lecturer Marking tab — attempts are always recorded.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="paste" className="gap-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="paste">Paste CSV</TabsTrigger>
          <TabsTrigger value="upload">Upload .csv</TabsTrigger>
          <TabsTrigger value="ai">
            <Sparkles className="size-3.5" aria-hidden />
            AI convert
          </TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="min-w-0 space-y-3">
          <Textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={`${header}\n${example}`}
            className="min-h-44 font-mono text-xs"
            aria-label="Paste CSV rows"
          />
          <p className="text-muted-foreground text-xs">
            Header row required · the <span className="font-mono">topic</span> column takes a topic
            slug or exact title from the CMS Topics tab · the optional{" "}
            <span className="font-mono">unit</span> column takes a unit code (BIO205) or exact unit
            name · up to {MAX_ROWS} rows per import.
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

        <TabsContent value="upload" className="min-w-0 space-y-3">
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

        <TabsContent value="ai" className="min-w-0 space-y-6">
          {/* ---------- Bulk staging queue ---------- */}
          <div className="glass-card min-w-0 space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="text-primary size-4" aria-hidden />
                  Bulk documents
                </h3>
                <p className="text-muted-foreground mt-1 text-xs">
                  Add many documents at once — e.g. ten note sets for{" "}
                  {destUnit?.code ?? "BIO 205"}. They are read and converted{" "}
                  <strong>one at a time</strong> so nothing times out; this list shows exactly
                  what's done, what's in process and what failed.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  id="import-auto-import"
                  checked={autoImport}
                  onCheckedChange={setAutoImport}
                  aria-label="Import automatically as each document converts"
                />
                <Label htmlFor="import-auto-import" className="text-xs font-medium">
                  Import as they convert
                </Label>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={bulkInputRef}
                id="import-bulk-files"
                type="file"
                accept={AI_ACCEPT}
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length === 0) return;
                  stageFiles(files);
                }}
              />
              <label htmlFor="import-bulk-files" className="sr-only">
                Choose documents to stage
              </label>
              <Button
                type="button"
                variant="outline"
                className="focus-ring"
                disabled={staged.length >= MAX_BULK_FILES}
                onClick={() => bulkInputRef.current?.click()}
              >
                <FileText className="size-4" aria-hidden />
                Add documents
              </Button>
              {readyCount > 0 ? (
                <Button
                  type="button"
                  className="focus-ring"
                  disabled={inFlight}
                  onClick={() => void importAllReady()}
                >
                  {bulkBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  Import {readyCount} ready
                </Button>
              ) : null}
              {doneCount > 0 ? (
                <Button type="button" variant="ghost" onClick={clearDone} disabled={inFlight}>
                  Clear imported
                </Button>
              ) : null}
              {staged.length > 0 ? (
                <p className="text-muted-foreground text-xs tabular-nums">
                  {doneCount} done · {readyCount} ready · {failedCount} failed ·{" "}
                  {inFlight ? "processing…" : `${waitingCount} waiting`}
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  .pdf · .docx · .pptx · .xlsx · .txt · .md — up to {MAX_BULK_FILES} documents, 12 MB
                  each
                </p>
              )}
            </div>

            {staged.length > 0 ? (
              <ul className="divide-border/60 scrollbar-slim max-h-80 divide-y overflow-y-auto rounded-lg border border-border/60">
                {staged.map((item) => {
                  const detected = detectedLine(item.conversion?.detected);
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="mt-0.5 shrink-0" aria-hidden>
                        {item.status === "done" ? (
                          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                        ) : item.status === "failed" ? (
                          <XCircle className="text-destructive size-4" />
                        ) : item.status === "ready" ? (
                          <CheckCircle2 className="size-4 text-primary" />
                        ) : (
                          <Loader2 className="text-muted-foreground size-4 animate-spin" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {STATUS_LABEL[item.status]}
                          {item.status === "done" && typeof item.inserted === "number"
                            ? ` — ${item.inserted} row${item.inserted === 1 ? "" : "s"} imported`
                            : ""}
                          {item.status === "ready" && item.conversion
                            ? ` — ${item.conversion.rowCount} row${
                                item.conversion.rowCount === 1 ? "" : "s"
                              } generated (${item.conversion.validCount} valid)`
                            : ""}
                          {item.error ? ` — ${item.error}` : ""}
                        </p>
                        {item.status === "ready" && detected ? (
                          <p className="text-xs text-emerald-700 dark:text-emerald-400">
                            AI detected: {detected}
                          </p>
                        ) : null}
                      </div>
                      {item.csv ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="focus-ring"
                          aria-label={`Download the CSV for ${item.name}`}
                          onClick={() => downloadCsv(item.name, item.csv as string)}
                        >
                          <Download className="size-3.5" aria-hidden />
                          CSV
                        </Button>
                      ) : null}
                      {item.status === "ready" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={inFlight}
                          onClick={() => void importOne(item.id)}
                          className="focus-ring"
                        >
                          <Upload className="size-3.5" aria-hidden />
                          Import
                        </Button>
                      ) : item.status === "failed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={inFlight}
                          onClick={() => retryOne(item.id)}
                          className="focus-ring"
                        >
                          <Play className="size-3.5" aria-hidden />
                          Retry
                        </Button>
                      ) : null}
                      {!inFlight && item.status !== "importing" ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="focus-ring size-7"
                          aria-label={`Remove ${item.name}`}
                          onClick={() => removeStaged(item.id)}
                        >
                          <XCircle className="size-3.5" aria-hidden />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* ---------- Single-document path ---------- */}
          <div className="min-w-0 space-y-4">
            <p className="text-muted-foreground text-sm">
              One document at a time with a review step: drop a PDF, Word, PowerPoint, Excel or
              plain-text file — or paste the material — then convert it into the {kind} CSV contract
              and edit anything before importing.
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
              {materialInfo ? <p className="text-muted-foreground text-xs">{materialInfo}</p> : null}
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
              <label htmlFor="ai-count" className="text-muted-foreground text-sm font-medium">
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
                {converting ? "Converting…" : `Convert to ${kind} CSV`}
              </Button>
              {material || conversion ? (
                <Button type="button" variant="ghost" onClick={resetAi} disabled={converting}>
                  Clear
                </Button>
              ) : null}
            </div>

            {conversion ? (
              <div className="min-w-0 space-y-3">
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
                {detectedLine(conversion.detected) ? (
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    AI detected: {detectedLine(conversion.detected)}
                    {destUnit ? " (destination unit pinned — it wins)" : ""}
                  </p>
                ) : null}
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
                  Edit anything above before importing — with a destination topic chosen every row is
                  already filed there; otherwise missing topics are auto-created on import.
                </p>
                <div className="flex flex-wrap items-center gap-2">
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
                  <Button
                    type="button"
                    variant="outline"
                    disabled={conversion.rowCount === 0 || !reviewText.trim()}
                    className="focus-ring"
                    onClick={() => downloadCsv(materialFileName ?? "converted", reviewText)}
                  >
                    <Download className="size-4" aria-hidden />
                    Download CSV
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>

      {result ? (
        <div className="min-w-0 space-y-3">
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
                  <span className="min-w-0">
                    <span className="font-medium">{item.row > 0 ? `Row ${item.row}:` : "Note:"}</span>{" "}
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
