"use client";

import { useState } from "react";
import { BookOpen, FolderTree, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";
import type { TopicListRow } from "@/app/console-api/topics/route";
import type { UnitListRow } from "@/app/console-api/units/route";

/**
 * Console CMS — content topics. Topics are the backbone of the whole
 * content model: the CSV / AI importers resolve every row's `topic`
 * column against this list, and students browse by topic inside each
 * exam zone or inside their course unit on /units. Create, edit,
 * reorder and delete topics here; the exam zones (CAT 1 / CAT 2 / Main)
 * come from the course structure, and each topic can additionally be
 * filed under a course unit (BIO 205 …).
 */

const ZONES: { value: TopicListRow["zone"]; label: string }[] = [
  { value: "cat1", label: "CAT 1" },
  { value: "cat2", label: "CAT 2" },
  { value: "main", label: "Main exam" },
];

const ZONE_LABELS: Record<TopicListRow["zone"], string> = Object.fromEntries(
  ZONES.map((zone) => [zone.value, zone.label]),
) as Record<TopicListRow["zone"], string>;

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

interface FormState {
  title: string;
  zone: TopicListRow["zone"];
  description: string;
  unitId: string; // "none" → no unit
}

const EMPTY_FORM: FormState = { title: "", zone: "main", description: "", unitId: "none" };

/** Human label for a unit option: "BIO205 · Biochemistry of Plants (Short, Year 2)". */
function unitLabel(unit: UnitListRow): string {
  const school = unit.schoolShort || unit.schoolName;
  const where = school ? `${school}, Year ${unit.year}` : `Year ${unit.year}`;
  return `${unit.code} · ${unit.name} (${where})`;
}

export function TopicsManager({
  initial,
  units: initialUnits,
}: {
  initial: TopicListRow[];
  units: UnitListRow[];
}) {
  const base = useConsoleBase();
  const [topics, setTopics] = useState<TopicListRow[]>(initial);
  const [units, setUnits] = useState<UnitListRow[]>(initialUnits);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [orderIndex, setOrderIndex] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<TopicListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setEditingSlug(null);
    setForm({ ...EMPTY_FORM, unitId: units[0] ? units[0].id : "none" });
    setOrderIndex("");
    setDialogOpen(true);
    void refreshUnits();
  };

  const openEdit = (topic: TopicListRow) => {
    setEditingId(topic.id);
    setEditingSlug(topic.slug);
    setForm({
      title: topic.title,
      zone: topic.zone,
      description: topic.description ?? "",
      unitId: topic.unitId ?? "none",
    });
    setOrderIndex(String(topic.orderIndex));
    setDialogOpen(true);
    void refreshUnits();
  };

  /** Pick up units created in the Units tab since page load. */
  const refreshUnits = async () => {
    try {
      const response = await fetch(consoleUrl(base, "api/units"));
      if (!response.ok) return;
      const data = (await response.json()) as { units: UnitListRow[] };
      setUnits(data.units);
    } catch {
      // Keep the seed list — refresh is best-effort.
    }
  };

  const saveTopic = async () => {
    const title = form.title.trim();
    if (title.length < 2) {
      toast.error("Give the topic a name (at least 2 characters)");
      return;
    }
    setBusy(true);
    try {
      const unitId = form.unitId !== "none" && form.unitId !== "" ? form.unitId : null;
      const payload = editingId
        ? {
            action: "update" as const,
            id: editingId,
            title,
            zone: form.zone,
            description: form.description.trim() || null,
            unitId,
            ...(orderIndex.trim() !== "" && !Number.isNaN(Number(orderIndex))
              ? { orderIndex: Number(orderIndex) }
              : {}),
          }
        : {
            action: "create" as const,
            title,
            zone: form.zone,
            description: form.description.trim() || undefined,
            unitId,
            ...(orderIndex.trim() !== "" && !Number.isNaN(Number(orderIndex))
              ? { orderIndex: Number(orderIndex) }
              : {}),
          };
      const response = await fetch(consoleUrl(base, "api/topics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't save the topic"));
        return;
      }
      const data = (await response.json()) as { topic: TopicListRow };
      setTopics((prev) =>
        editingId
          ? prev.map((entry) => (entry.id === editingId ? data.topic : entry))
          : [...prev, data.topic],
      );
      toast.success(
        editingId
          ? "Topic updated"
          : `Topic "${data.topic.title}" created — importers can use it now`,
      );
      setDialogOpen(false);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  const deleteTopic = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/topics"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleting.id }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't delete the topic"));
        return;
      }
      setTopics((prev) => prev.filter((entry) => entry.id !== deleting.id));
      toast.success(`Topic "${deleting.title}" deleted`);
      setDeleting(null);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <FolderTree className="text-primary size-4" aria-hidden /> Content topics
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Every note, question and discussion lives in a topic. Importers match rows against
            this list — anything unknown is created here automatically when you tick{" "}
            <em>auto-create missing topics</em> on the Import page.
          </p>
        </div>
        <Button type="button" onClick={openCreate} className="focus-ring">
          <Plus className="size-4" aria-hidden />
          New topic
        </Button>
      </div>

      {topics.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="size-6" aria-hidden />}
          title="No topics yet"
          description="Create your first topic (e.g. “Glycolysis”, CAT 1) — then the CSV and AI importers can file content under it."
          action={
            <Button type="button" onClick={openCreate} className="focus-ring">
              <Plus className="size-4" aria-hidden />
              New topic
            </Button>
          }
        />
      ) : (
        <div className="glass-card divide-border/60 scrollbar-slim max-h-[26rem] divide-y overflow-y-auto">
          {topics.map((topic) => (
            <div key={topic.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{topic.title}</p>
                  <Badge variant="secondary" className="text-[10px]">
                    {ZONE_LABELS[topic.zone]}
                  </Badge>
                  {topic.unitCode ? (
                    <Badge variant="outline" className="text-primary border-primary/40 text-[10px]">
                      <GraduationCap className="mr-0.5 size-3" aria-hidden />
                      {topic.unitCode}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                  {topic.slug}
                  {topic.description ? <span className="font-sans"> · {topic.description}</span> : null}
                </p>
                <p className="text-muted-foreground/80 mt-0.5 flex items-center gap-1 text-xs">
                  <BookOpen className="size-3" aria-hidden />
                  {topic.notesCount} {topic.notesCount === 1 ? "note" : "notes"} ·{" "}
                  {topic.questionsCount} {topic.questionsCount === 1 ? "question" : "questions"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(topic)}
                  className="focus-ring size-8"
                  aria-label={`Edit ${topic.title}`}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setDeleting(topic)}
                  className="focus-ring text-destructive size-8"
                  aria-label={`Delete ${topic.title}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Create / edit dialog ---------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setEditingSlug(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit topic" : "New topic"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "The slug stays fixed so existing links keep working — the title, zone and description can change."
                : "Importers reference topics by slug or exact title — e.g. a CSV row with topic “glycolysis” files into the topic with that slug."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="topic-title">Title</Label>
              <Input
                id="topic-title"
                value={form.title}
                maxLength={160}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Glycolysis"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topic-zone">Exam zone</Label>
                <Select
                  value={form.zone}
                  onValueChange={(zone) =>
                    setForm({ ...form, zone: zone as TopicListRow["zone"] })
                  }
                >
                  <SelectTrigger id="topic-zone" aria-label="Choose the exam zone">
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
              <div className="space-y-2">
                <Label htmlFor="topic-order">Order (optional)</Label>
                <Input
                  id="topic-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={orderIndex}
                  onChange={(event) => setOrderIndex(event.target.value)}
                  placeholder="Auto"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-unit">Course unit (optional)</Label>
              <Select
                value={form.unitId}
                onValueChange={(unitId) => setForm({ ...form, unitId })}
              >
                <SelectTrigger id="topic-unit" aria-label="Choose the course unit">
                  <SelectValue placeholder="No unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No unit — zone only</SelectItem>
                  {units.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id}>
                      {unitLabel(unit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-[11px]">
                File the topic under a unit (e.g. BIO 205) so students of that school + year find
                it on <span className="font-mono">/units</span>. Create units on the Units tab.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="topic-description">Description (optional)</Label>
              <Textarea
                id="topic-description"
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="One line students see when browsing the zone"
              />
            </div>
            {!editingId ? (
              <p className="text-muted-foreground text-xs">
                Slug is generated from the title:{" "}
                <span className="font-mono">{form.title.trim() ? form.title.trim() : "glycolysis"}</span>{" "}
                → <span className="font-mono">{slugPreview(form.title)}</span>
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Slug: <span className="font-mono">{editingSlug}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveTopic()} disabled={busy} className="focus-ring">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {editingId ? "Save changes" : "Create topic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Delete confirmation ---------- */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This also permanently deletes the topic&apos;s {deleting?.notesCount ?? 0}{" "}
              {deleting?.notesCount === 1 ? "note" : "notes"} and {deleting?.questionsCount ?? 0}{" "}
              {deleting?.questionsCount === 1 ? "question" : "questions"}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteTopic();
              }}
              disabled={deleteBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete topic
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Local slug preview mirroring the API's slugify (kept in sync loosely). */
function slugPreview(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "glycolysis"
  );
}
