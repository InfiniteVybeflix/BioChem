"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  Loader2,
  Move,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";
import type { UnitListRow } from "@/app/console-api/units/route";
import type { ContentListRow } from "@/app/console-api/content/route";

/**
 * Console content library — everything the importers have created,
 * in one place. Fix a wrongly-copied import by editing the row, moving
 * it (or a whole selection) to the correct topic, unpublishing it, or
 * deleting it outright. Search and filters (topic, unit, zone, status)
 * narrow the list; pagination keeps it light.
 */

export interface ContentTopicOption {
  id: string;
  title: string;
  slug: string;
  zone: string;
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
}

const ZONES = [
  { value: "cat1", label: "CAT 1" },
  { value: "cat2", label: "CAT 2" },
  { value: "main", label: "Main exam" },
];
const ZONE_LABELS: Record<string, string> = Object.fromEntries(
  ZONES.map((z) => [z.value, z.label]),
);
const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const TYPES = [
  { value: "mcq", label: "MCQ" },
  { value: "short_answer", label: "Short answer" },
  { value: "long_answer", label: "Essay" },
  { value: "structured", label: "Structured" },
];
const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.value, t.label]));
const STATUSES = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft (hidden from students)" },
  { value: "pending", label: "Pending review" },
  { value: "archived", label: "Archived" },
];
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUSES.map((s) => [s.value, s.label]),
);

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  const server =
    typeof payload === "object" && payload !== null && "error" in payload
      ? String((payload as { error: unknown }).error)
      : null;
  if (response.status === 401) {
    return "Your console session expired — reload the page and sign in again.";
  }
  return server ?? fallback;
}

function unitLabel(unit: UnitListRow): string {
  const school = unit.schoolShort || unit.schoolName;
  const where = school ? `${school}, Year ${unit.year}` : `Year ${unit.year}`;
  return `${unit.code} · ${unit.name} (${where})`;
}

function topicLabel(topic: ContentTopicOption): string {
  const unit = topic.unitCode ? ` · ${topic.unitCode}` : "";
  return `${topic.title}${unit} (${ZONE_LABELS[topic.zone] ?? topic.zone})`;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Options currently on the row, normalised to the A/B/C/D editor. */
function optionsToForm(options: unknown): { a: string; b: string; c: string; d: string } {
  const list = Array.isArray(options) ? options : [];
  const pick = (key: string) => {
    const found = list.find((o) => (o as { key?: string })?.key === key);
    return found ? String((found as { text?: string }).text ?? "") : "";
  };
  return { a: pick("A"), b: pick("B"), c: pick("C"), d: pick("D") };
}

interface NoteForm {
  title: string;
  summary: string;
  topicId: string; // "none" → no topic
  status: string;
  examCritical: boolean;
  readingMinutes: string;
  tags: string;
  contentMd: string;
}

interface QuestionForm {
  topicId: string;
  zone: string;
  difficulty: string;
  type: string;
  marks: string;
  stemMd: string;
  options: { a: string; b: string; c: string; d: string };
  answerKey: string;
  explanationMd: string;
  tags: string;
  answersHidden: boolean;
  answersReleaseAt: string; // datetime-local value
  status: string;
}

function tagsToForm(tags: string[]): string {
  return tags.join(", ");
}
function formToTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0)
    .slice(0, 8);
}

/** datetime-local → ISO with offset (or null when cleared). */
function localToIso(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ContentLibrary({
  topics,
  units,
}: {
  topics: ContentTopicOption[];
  units: UnitListRow[];
}) {
  const base = useConsoleBase();

  const [kind, setKind] = useState<"notes" | "questions">("notes");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [topicFilter, setTopicFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState<"delete" | "move" | null>(null);
  const [moveTarget, setMoveTarget] = useState("none");

  const [editing, setEditing] = useState<ContentListRow | null>(null);
  const [noteForm, setNoteForm] = useState<NoteForm | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionForm | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [deleting, setDeleting] = useState<ContentListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search box so typing doesn't hammer the API.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const topicsForUnit = useCallback(
    (unitId: string) => {
      if (unitId === "all") return topics;
      return topics.filter((topic) => topic.unitId === unitId);
    },
    [topics],
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ kind, page: String(page) });
    if (searchDebounced) params.set("q", searchDebounced);
    if (topicFilter !== "all") params.set("topic", topicFilter);
    if (unitFilter !== "all") params.set("unit", unitFilter);
    if (kind === "questions" && zoneFilter !== "all") params.set("zone", zoneFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);

    try {
      const response = await fetch(consoleUrl(base, `api/content?${params.toString()}`), {
        cache: "no-store",
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't load the content list"));
        setRows([]);
        setTotal(0);
        return;
      }
      const data = (await response.json()) as { rows: ContentListRow[]; total: number };
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setSelected(new Set());
    } catch {
      toast.error("Network problem — couldn't load the content list");
    } finally {
      setLoading(false);
    }
  }, [base, kind, page, searchDebounced, topicFilter, unitFilter, zoneFilter, statusFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows, reloadKey]);

  const switchKind = (value: string) => {
    setKind(value === "questions" ? "questions" : "notes");
    setPage(1);
    setZoneFilter("all");
    setSelected(new Set());
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((row) => next.delete(row.id));
      else rows.forEach((row) => next.add(row.id));
      return next;
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  const post = useCallback(
    async (payload: Record<string, unknown>, successMessage: string): Promise<boolean> => {
      try {
        const response = await fetch(consoleUrl(base, "api/content"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          toast.error(await readError(response, "The change didn't go through"));
          return false;
        }
        toast.success(successMessage);
        return true;
      } catch {
        toast.error("Network problem — the change didn't go through");
        return false;
      }
    },
    [base],
  );

  const openEdit = (row: ContentListRow) => {
    setEditing(row);
    const fallbackTopic = topics[0]?.id ?? "none";
    if (row.kind === "notes") {
      // notes.topic_id is NOT NULL — the editor always keeps a real topic.
      setNoteForm({
        title: row.title,
        summary: "",
        topicId: row.topicId ?? fallbackTopic,
        status: row.status,
        examCritical: row.isExamCritical,
        readingMinutes: "5",
        tags: tagsToForm(row.tags),
        contentMd: "",
      });
    } else {
      setQuestionForm({
        topicId: row.topicId ?? "none",
        zone: row.zone || "main",
        difficulty: row.difficulty || "medium",
        type: row.type || "mcq",
        marks: String(row.marks ?? 1),
        stemMd: row.title,
        options: { a: "", b: "", c: "", d: "" },
        answerKey: "",
        explanationMd: "",
        tags: tagsToForm(row.tags),
        answersHidden: row.answersHidden,
        answersReleaseAt: isoToLocal(row.answersReleaseAt),
        status: row.status,
      });
    }
    void loadDetail(row);
  };

  /** Pull the full editable fields for the row being edited. */
  const loadDetail = async (row: ContentListRow) => {
    try {
      const response = await fetch(
        consoleUrl(base, `api/content?kind=${row.kind}&id=${row.id}`),
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const data = (await response.json()) as {
        detail:
          | {
              kind: "notes";
              title: string;
              summary: string;
              contentMd: string;
              topicId: string | null;
              status: string;
              isExamCritical: boolean;
              readingMinutes: number;
              tags: string[];
            }
          | {
              kind: "questions";
              topicId: string | null;
              zone: string;
              difficulty: string;
              type: string;
              marks: number;
              stemMd: string;
              options: { key: string; text: string }[];
              answerKey: string;
              explanationMd: string;
              tags: string[];
              answersHidden: boolean;
              answersReleaseAt: string | null;
              status: string;
            };
      };
      const detail = data.detail;
      if (!detail || detail.kind !== row.kind) return;
      if (detail.kind === "notes") {
        setNoteForm({
          title: detail.title,
          summary: detail.summary,
          topicId: detail.topicId ?? topics[0]?.id ?? "none",
          status: detail.status,
          examCritical: detail.isExamCritical,
          readingMinutes: String(detail.readingMinutes),
          tags: tagsToForm(detail.tags),
          contentMd: detail.contentMd,
        });
      } else {
        setQuestionForm({
          topicId: detail.topicId ?? "none",
          zone: detail.zone,
          difficulty: detail.difficulty,
          type: detail.type,
          marks: String(detail.marks),
          stemMd: detail.stemMd,
          options: optionsToForm(detail.options),
          answerKey: detail.answerKey,
          explanationMd: detail.explanationMd,
          tags: tagsToForm(detail.tags),
          answersHidden: detail.answersHidden,
          answersReleaseAt: isoToLocal(detail.answersReleaseAt),
          status: detail.status,
        });
      }
    } catch {
      // The dialog stays usable with the list-row values.
    }
  };

  const saveEdits = async () => {
    if (!editing) return;
    if (editing.kind === "notes" && noteForm) {
      if (noteForm.title.trim().length < 2) {
        toast.error("Give the note a title (at least 2 characters)");
        return;
      }
      if (noteForm.topicId === "none") {
        toast.error("Pick the topic this note belongs to");
        return;
      }
      setSaveBusy(true);
      const ok = await post(
        {
          action: "update_note",
          id: editing.id,
          title: noteForm.title.trim(),
          topicId: noteForm.topicId,
          status: noteForm.status,
          isExamCritical: noteForm.examCritical,
          readingMinutes: Math.min(120, Math.max(1, Number(noteForm.readingMinutes) || 5)),
          tags: formToTags(noteForm.tags),
          ...(noteForm.summary.trim() ? { summary: noteForm.summary.trim() } : {}),
          ...(noteForm.contentMd.trim() ? { contentMd: noteForm.contentMd } : {}),
        },
        "Note updated",
      );
      setSaveBusy(false);
      if (ok) {
        setEditing(null);
        setNoteForm(null);
        setReloadKey((key) => key + 1);
      }
      return;
    }
    if (editing.kind === "questions" && questionForm) {
      if (questionForm.stemMd.trim().length < 3) {
        toast.error("The question stem is too short");
        return;
      }
      if (questionForm.type === "mcq") {
        const filled = [questionForm.options.a, questionForm.options.b, questionForm.options.c, questionForm.options.d]
          .map((text) => text.trim())
          .filter(Boolean);
        if (filled.length < 2) {
          toast.error("An MCQ needs at least two options");
          return;
        }
        const answer = questionForm.answerKey.trim().toUpperCase();
        if (!["A", "B", "C", "D"].includes(answer)) {
          toast.error("For an MCQ the answer must be the option letter — A, B, C or D");
          return;
        }
      } else if (!questionForm.answerKey.trim()) {
        toast.error("Give the model answer (students reveal it after attempting)");
        return;
      }
      setSaveBusy(true);
      const optionsPayload =
        questionForm.type === "mcq"
          ? [
              { key: "A", text: questionForm.options.a.trim() },
              { key: "B", text: questionForm.options.b.trim() },
              { key: "C", text: questionForm.options.c.trim() },
              { key: "D", text: questionForm.options.d.trim() },
            ].filter((option) => option.text.length > 0)
          : [];
      const ok = await post(
        {
          action: "update_question",
          id: editing.id,
          topicId: questionForm.topicId === "none" ? null : questionForm.topicId,
          zone: questionForm.zone,
          difficulty: questionForm.difficulty,
          type: questionForm.type,
          marks: Math.min(30, Math.max(1, Number(questionForm.marks) || 1)),
          stemMd: questionForm.stemMd.trim(),
          ...(questionForm.type === "mcq" ? { options: optionsPayload } : {}),
          answerKey: questionForm.answerKey.trim(),
          explanationMd: questionForm.explanationMd.trim(),
          tags: formToTags(questionForm.tags),
          answersHidden: questionForm.answersHidden,
          answersReleaseAt: localToIso(questionForm.answersReleaseAt),
          status: questionForm.status,
        },
        "Question updated",
      );
      setSaveBusy(false);
      if (ok) {
        setEditing(null);
        setQuestionForm(null);
        setReloadKey((key) => key + 1);
      }
    }
  };

  const deleteRow = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const ok = await post(
      { action: "delete", kind: deleting.kind, id: deleting.id },
      deleting.kind === "notes" ? "Note deleted" : "Question deleted",
    );
    setDeleteBusy(false);
    if (ok) {
      setDeleting(null);
      setReloadKey((key) => key + 1);
    }
  };

  const runBulk = async () => {
    const ids = [...selected];
    if (!confirmBulk || ids.length === 0) return;
    setBulkBusy(true);
    if (confirmBulk === "delete") {
      const ok = await post(
        { action: "bulk_delete", kind, ids },
        `${ids.length} ${kind === "notes" ? "note(s)" : "question(s)"} deleted`,
      );
      if (ok) setConfirmBulk(null);
    } else {
      if (moveTarget === "none") {
        toast.error("Pick the topic to move the selection into");
        setBulkBusy(false);
        return;
      }
      const ok = await post(
        { action: "bulk_move", kind, ids, topicId: moveTarget },
        `${ids.length} item(s) moved`,
      );
      if (ok) setConfirmBulk(null);
    }
    setBulkBusy(false);
    setReloadKey((key) => key + 1);
  };

  const activeFilters = useMemo(
    () =>
      [topicFilter, unitFilter, zoneFilter, statusFilter].filter((value) => value !== "all").length +
      (searchDebounced ? 1 : 0),
    [topicFilter, unitFilter, zoneFilter, statusFilter, searchDebounced],
  );

  const resetFilters = () => {
    setSearch("");
    setSearchDebounced("");
    setTopicFilter("all");
    setUnitFilter("all");
    setZoneFilter("all");
    setStatusFilter("all");
    setPage(1);
  };

  return (
    <div className="space-y-3">
      {/* Kind tabs + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onValueChange={switchKind}>
          <TabsList>
            <TabsTrigger value="notes" className="gap-1.5">
              <BookOpen className="size-3.5" /> Notes
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5">
              <Search className="size-3.5" /> Questions
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 size-4" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={kind === "notes" ? "Search notes…" : "Search questions…"}
            className="pl-8"
          />
        </div>
        <Select
          value={unitFilter}
          onValueChange={(value) => {
            setUnitFilter(value);
            setTopicFilter("all");
            setPage(1);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All units" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All units</SelectItem>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unitLabel(unit)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={topicFilter}
          onValueChange={(value) => {
            setTopicFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue placeholder="All topics" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics</SelectItem>
            {topicsForUnit(unitFilter).map((topic) => (
              <SelectItem key={topic.id} value={topic.id}>
                {topicLabel(topic)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          {kind === "questions" ? (
            <Select
              value={zoneFilter}
              onValueChange={(value) => {
                setZoneFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="Zone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                {ZONES.map((zone) => (
                  <SelectItem key={zone.value} value={zone.value}>
                    {zone.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger size="sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 ? (
        <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border p-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={() => {
              setMoveTarget(topics[0] ? topics[0].id : "none");
              setConfirmBulk("move");
            }}
          >
            <Move className="size-3.5" /> Move to topic…
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setConfirmBulk("delete")}
          >
            <Trash2 className="size-3.5" /> Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
          <Loader2 className="size-4 animate-spin" /> Loading content…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-6" />}
          title={activeFilters > 0 ? "Nothing matches these filters" : "Nothing imported yet"}
          description={
            activeFilters > 0
              ? "Try clearing the search or the topic / unit / status filters."
              : "Import notes and questions from the Import page — everything that lands there shows up here for editing, moving or deleting."
          }
          action={
            activeFilters > 0 ? (
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="select-all-page"
              checked={allOnPageSelected}
              onCheckedChange={toggleAllOnPage}
              aria-label="Select all on this page"
            />
            <Label
              htmlFor="select-all-page"
              className="text-muted-foreground cursor-pointer text-xs"
            >
              Select all on this page ({rows.length})
            </Label>
          </div>
          <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="glass-card flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:gap-3"
            >
              <Checkbox
                className="mt-1"
                checked={selected.has(row.id)}
                onCheckedChange={() => toggleRow(row.id)}
                aria-label={`Select ${truncate(row.title, 60)}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug font-medium">{truncate(row.title, 160)}</p>
                {row.preview ? (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {truncate(row.preview, 180)}
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {row.topicTitle ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {row.topicTitle}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px]">
                      No topic
                    </Badge>
                  )}
                  {row.unitCode ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {row.unitCode}
                    </Badge>
                  ) : null}
                  {row.zone ? (
                    <Badge variant="outline" className="text-[11px]">
                      {ZONE_LABELS[row.zone] ?? row.zone}
                    </Badge>
                  ) : null}
                  {row.type ? (
                    <Badge variant="outline" className="text-[11px]">
                      {TYPE_LABELS[row.type] ?? row.type}
                    </Badge>
                  ) : null}
                  {row.difficulty ? (
                    <Badge variant="outline" className="text-[11px] capitalize">
                      {row.difficulty}
                    </Badge>
                  ) : null}
                  {row.status !== "published" ? (
                    <Badge variant="destructive" className="text-[11px]">
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  ) : null}
                  {row.answersHidden ? (
                    <Badge variant="outline" className="text-[11px]">
                      <EyeOff className="mr-1 size-3" /> Answers hidden
                    </Badge>
                  ) : null}
                  {row.isExamCritical ? (
                    <Badge variant="outline" className="text-[11px]">
                      Exam critical
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground/70 text-[11px]">
                    {timeAgo(row.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                  <Pencil className="size-3.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleting(row)}
                >
                  <Trash2 className="size-3.5" /> Delete
                </Button>
              </div>
            </li>
          ))}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="size-3.5" /> Previous
          </Button>
          <span className="text-muted-foreground text-xs">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>
      ) : null}

      {/* Edit dialog — note */}
      <Dialog open={Boolean(editing) && Boolean(noteForm)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit note</DialogTitle>
            <DialogDescription>
              Fix the title, summary, tags or body. Leave the body untouched to keep the imported
              text as-is.
            </DialogDescription>
          </DialogHeader>
          {noteForm ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="note-title">Title</Label>
                <Input
                  id="note-title"
                  value={noteForm.title}
                  onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note-topic">Topic</Label>
                <Select
                  value={noteForm.topicId}
                  onValueChange={(value) => setNoteForm({ ...noteForm, topicId: value })}
                >
                  <SelectTrigger id="note-topic">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        {topicLabel(topic)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {topics.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Create a topic in CMS → Topics first — every note must live in one.
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note-summary">Summary</Label>
                <Textarea
                  id="note-summary"
                  rows={2}
                  value={noteForm.summary}
                  onChange={(event) => setNoteForm({ ...noteForm, summary: event.target.value })}
                  placeholder="One or two sentences shown in lists"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="note-status">Status</Label>
                  <Select
                    value={noteForm.status}
                    onValueChange={(value) => setNoteForm({ ...noteForm, status: value })}
                  >
                    <SelectTrigger id="note-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="note-minutes">Reading minutes</Label>
                  <Input
                    id="note-minutes"
                    type="number"
                    min={1}
                    max={120}
                    value={noteForm.readingMinutes}
                    onChange={(event) =>
                      setNoteForm({ ...noteForm, readingMinutes: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="note-tags">Tags (comma separated)</Label>
                  <Input
                    id="note-tags"
                    value={noteForm.tags}
                    onChange={(event) => setNoteForm({ ...noteForm, tags: event.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div>
                  <Label htmlFor="note-critical">Exam critical</Label>
                  <p className="text-muted-foreground text-xs">
                    Highlighted as must-read before exams.
                  </p>
                </div>
                <Switch
                  id="note-critical"
                  checked={noteForm.examCritical}
                  onCheckedChange={(checked) => setNoteForm({ ...noteForm, examCritical: checked })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="note-body">Note body (Markdown)</Label>
                <Textarea
                  id="note-body"
                  rows={12}
                  value={noteForm.contentMd}
                  onChange={(event) => setNoteForm({ ...noteForm, contentMd: event.target.value })}
                  placeholder="Leave empty to keep the imported body exactly as it is."
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saveBusy}>
              Cancel
            </Button>
            <Button onClick={saveEdits} disabled={saveBusy}>
              {saveBusy ? <Loader2 className="size-4 animate-spin" /> : null} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog — question */}
      <Dialog
        open={Boolean(editing) && Boolean(questionForm)}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit question</DialogTitle>
            <DialogDescription>
              Fix the stem, options, answer or where the question is filed.
            </DialogDescription>
          </DialogHeader>
          {questionForm ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="q-stem">Question</Label>
                <Textarea
                  id="q-stem"
                  rows={3}
                  value={questionForm.stemMd}
                  onChange={(event) =>
                    setQuestionForm({ ...questionForm, stemMd: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="q-topic">Topic</Label>
                  <Select
                    value={questionForm.topicId}
                    onValueChange={(value) => setQuestionForm({ ...questionForm, topicId: value })}
                  >
                    <SelectTrigger id="q-topic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No topic</SelectItem>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {topicLabel(topic)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="q-zone">Exam zone</Label>
                  <Select
                    value={questionForm.zone}
                    onValueChange={(value) => setQuestionForm({ ...questionForm, zone: value })}
                  >
                    <SelectTrigger id="q-zone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ZONES.map((zone) => (
                        <SelectItem key={zone.value} value={zone.value}>
                          {zone.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="q-type">Type</Label>
                  <Select
                    value={questionForm.type}
                    onValueChange={(value) => setQuestionForm({ ...questionForm, type: value })}
                  >
                    <SelectTrigger id="q-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="q-diff">Difficulty</Label>
                  <Select
                    value={questionForm.difficulty}
                    onValueChange={(value) =>
                      setQuestionForm({ ...questionForm, difficulty: value })
                    }
                  >
                    <SelectTrigger id="q-diff">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((difficulty) => (
                        <SelectItem key={difficulty.value} value={difficulty.value}>
                          {difficulty.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="q-marks">Marks</Label>
                  <Input
                    id="q-marks"
                    type="number"
                    min={1}
                    max={30}
                    value={questionForm.marks}
                    onChange={(event) => setQuestionForm({ ...questionForm, marks: event.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="q-status">Status</Label>
                  <Select
                    value={questionForm.status}
                    onValueChange={(value) => setQuestionForm({ ...questionForm, status: value })}
                  >
                    <SelectTrigger id="q-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {questionForm.type === "mcq" ? (
                <div className="grid gap-2">
                  <Label>Options</Label>
                  {(["a", "b", "c", "d"] as const).map((key, index) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge variant="secondary" className="w-7 justify-center">
                        {String.fromCharCode(65 + index)}
                      </Badge>
                      <Input
                        value={questionForm.options[key]}
                        onChange={(event) =>
                          setQuestionForm({
                            ...questionForm,
                            options: { ...questionForm.options, [key]: event.target.value },
                          })
                        }
                        placeholder={
                          index < 2 ? `Option ${String.fromCharCode(65 + index)} (required)` : `Option ${String.fromCharCode(65 + index)} (optional)`
                        }
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="q-answer">
                  {questionForm.type === "mcq" ? "Correct option (A–D)" : "Model answer"}
                </Label>
                {questionForm.type === "mcq" ? (
                  <Select
                    value={questionForm.answerKey.toUpperCase() || undefined}
                    onValueChange={(value) => setQuestionForm({ ...questionForm, answerKey: value })}
                  >
                    <SelectTrigger id="q-answer">
                      <SelectValue placeholder="Pick the correct option" />
                    </SelectTrigger>
                    <SelectContent>
                      {(["A", "B", "C", "D"] as const)
                        .filter((key) => {
                          const text =
                            key === "A"
                              ? questionForm.options.a
                              : key === "B"
                                ? questionForm.options.b
                                : key === "C"
                                  ? questionForm.options.c
                                  : questionForm.options.d;
                          return text.trim().length > 0;
                        })
                        .map((key) => (
                          <SelectItem key={key} value={key}>
                            {key}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Textarea
                    id="q-answer"
                    rows={3}
                    value={questionForm.answerKey}
                    onChange={(event) =>
                      setQuestionForm({ ...questionForm, answerKey: event.target.value })
                    }
                    placeholder="The model answer students see after attempting (or when the lecturer releases it)"
                  />
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-explanation">Explanation</Label>
                <Textarea
                  id="q-explanation"
                  rows={3}
                  value={questionForm.explanationMd}
                  onChange={(event) =>
                    setQuestionForm({ ...questionForm, explanationMd: event.target.value })
                  }
                  placeholder="Shown with the answer — why this is correct"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-tags">Tags (comma separated)</Label>
                <Input
                  id="q-tags"
                  value={questionForm.tags}
                  onChange={(event) => setQuestionForm({ ...questionForm, tags: event.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-2.5">
                <div>
                  <Label htmlFor="q-hidden">Hide answers</Label>
                  <p className="text-muted-foreground text-xs">
                    Students can attempt but the answer/explanation stay withheld until you release
                    them (lecturer panel → Marking).
                  </p>
                </div>
                <Switch
                  id="q-hidden"
                  checked={questionForm.answersHidden}
                  onCheckedChange={(checked) =>
                    setQuestionForm({ ...questionForm, answersHidden: checked })
                  }
                />
              </div>
              {questionForm.answersHidden ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="q-release">Auto-release answers at (optional)</Label>
                  <Input
                    id="q-release"
                    type="datetime-local"
                    value={questionForm.answersReleaseAt}
                    onChange={(event) =>
                      setQuestionForm({ ...questionForm, answersReleaseAt: event.target.value })
                    }
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saveBusy}>
              Cancel
            </Button>
            <Button onClick={saveEdits} disabled={saveBusy}>
              {saveBusy ? <Loader2 className="size-4 animate-spin" /> : null} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm — single */}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this {deleting?.kind === "notes" ? "note" : "question"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{truncate(deleting?.title ?? "", 120)}&rdquo; will be removed permanently.
              Students lose access immediately — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={deleteBusy}
              onClick={(event) => {
                event.preventDefault();
                void deleteRow();
              }}
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk confirm — delete or move */}
      <AlertDialog open={Boolean(confirmBulk)} onOpenChange={(open) => !open && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBulk === "delete" ? `Delete ${selected.size} selected item(s)?` : "Move to another topic"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBulk === "delete" ? (
                <>
                  The {selected.size} selected {kind === "notes" ? "note(s)" : "question(s)"} will be
                  removed permanently. This cannot be undone.
                </>
              ) : (
                <>Pick the topic the selection should be re-filed under.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmBulk === "move" ? (
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Choose the destination topic" />
              </SelectTrigger>
              <SelectContent>
                {topics.map((topic) => (
                  <SelectItem key={topic.id} value={topic.id}>
                    {topicLabel(topic)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmBulk === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : ""}
              disabled={bulkBusy || (confirmBulk === "move" && moveTarget === "none")}
              onClick={(event) => {
                event.preventDefault();
                void runBulk();
              }}
            >
              {bulkBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              {confirmBulk === "delete" ? "Delete all" : "Move"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
