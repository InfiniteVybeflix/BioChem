"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
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
import type { UnitListRow } from "@/app/console-api/units/route";

/**
 * Console CMS — course units. Units are the real courses students take
 * (BIO 205 "Biochemistry of Plants", MIC 205 …), each scoped to a school
 * and a study year. Topics are filed under units from the Topics tab;
 * students browse School → Year → Unit on /units and read the notes
 * inside. Create, edit and delete units here.
 */

export interface SchoolOption {
  id: string;
  name: string;
  shortName: string;
  maxYears: number;
}

interface FormState {
  schoolId: string;
  code: string;
  name: string;
  year: string;
  semester: string;
  description: string;
}

const EMPTY_FORM: FormState = {
  schoolId: "",
  code: "",
  name: "",
  year: "",
  semester: "none",
  description: "",
};

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

export function UnitsManager({
  initial,
  schools,
}: {
  initial: UnitListRow[];
  schools: SchoolOption[];
}) {
  const base = useConsoleBase();
  const [units, setUnits] = useState<UnitListRow[]>(initial);
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<UnitListRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const visible = useMemo(
    () => units.filter((unit) => schoolFilter === "all" || unit.schoolId === schoolFilter),
    [units, schoolFilter],
  );

  // Group: school → year → units (matches how students browse).
  const grouped = useMemo(() => {
    const bySchool = new Map<string, Map<number, UnitListRow[]>>();
    for (const unit of visible) {
      let years = bySchool.get(unit.schoolId);
      if (!years) {
        years = new Map<number, UnitListRow[]>();
        bySchool.set(unit.schoolId, years);
      }
      const list = years.get(unit.year) ?? [];
      list.push(unit);
      years.set(unit.year, list);
    }
    return [...bySchool.entries()].map(([schoolId, years]) => ({
      school: schools.find((school) => school.id === schoolId) ?? {
        id: schoolId,
        name: units.find((unit) => unit.schoolId === schoolId)?.schoolName ?? "Unknown school",
        shortName: units.find((unit) => unit.schoolId === schoolId)?.schoolShort ?? "?",
        maxYears: 4,
      },
      years: [...years.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([year, list]) => ({
          year,
          units: [...list].sort(
            (a, b) => a.orderIndex - b.orderIndex || a.code.localeCompare(b.code),
          ),
        })),
    }));
  }, [visible, schools, units]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      schoolId: schoolFilter !== "all" ? schoolFilter : (schools[0]?.id ?? ""),
      year: schools[0] ? "1" : "",
    });
    setDialogOpen(true);
  };

  const openEdit = (unit: UnitListRow) => {
    setEditingId(unit.id);
    setForm({
      schoolId: unit.schoolId,
      code: unit.code,
      name: unit.name,
      year: String(unit.year),
      semester: unit.semester ? String(unit.semester) : "none",
      description: unit.description ?? "",
    });
    setDialogOpen(true);
  };

  const reload = async () => {
    const response = await fetch(consoleUrl(base, "api/units"));
    if (!response.ok) return;
    const data = (await response.json()) as { units: UnitListRow[] };
    setUnits(data.units);
  };

  const saveUnit = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!form.schoolId) {
      toast.error("Pick the school the unit belongs to");
      return;
    }
    if (code.length < 2) {
      toast.error("Give the unit a code (e.g. BIO205)");
      return;
    }
    if (name.length < 2) {
      toast.error("Give the unit a name (e.g. Biochemistry of Plants)");
      return;
    }
    const year = Number(form.year);
    if (!year || year < 1 || year > 8) {
      toast.error("Pick the study year this unit is taught in");
      return;
    }
    setBusy(true);
    try {
      const semester = form.semester !== "none" ? Number(form.semester) : null;
      const payload = editingId
        ? {
            action: "update" as const,
            id: editingId,
            schoolId: form.schoolId,
            code,
            name,
            year,
            semester,
            description: form.description.trim() || null,
          }
        : {
            action: "create" as const,
            schoolId: form.schoolId,
            code,
            name,
            year,
            semester,
            description: form.description.trim() || undefined,
          };
      const response = await fetch(consoleUrl(base, "api/units"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't save the unit"));
        return;
      }
      await reload();
      toast.success(
        editingId
          ? `Unit ${code} updated`
          : `Unit ${code} — ${name} created. File topics under it from the Topics tab.`,
      );
      setDialogOpen(false);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  const deleteUnit = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/units"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: deleting.id }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't delete the unit"));
        return;
      }
      setUnits((prev) => prev.filter((entry) => entry.id !== deleting.id));
      toast.success(
        `Unit ${deleting.code} deleted — its topics are kept and simply lose the unit tag`,
      );
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
            <GraduationCap className="text-primary size-4" aria-hidden /> Course units
          </h3>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            The real units students take — <span className="font-mono">BIO 205 · Biochemistry of
            Plants</span>, <span className="font-mono">MIC 205 · Microbial Biochemistry</span> —
            each scoped to a school and a study year. Students open{" "}
            <em>their</em> unit on <span className="font-mono">/units</span> and read the notes
            filed inside it.
          </p>
        </div>
        <div className="flex items-end gap-2">
          {schools.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor="units-school-filter" className="text-xs">
                School
              </Label>
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger id="units-school-filter" className="w-44" aria-label="Filter by school">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All schools</SelectItem>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.shortName || school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button type="button" onClick={openCreate} className="focus-ring" disabled={schools.length === 0}>
            <Plus className="size-4" aria-hidden />
            New unit
          </Button>
        </div>
      </div>

      {schools.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-6" aria-hidden />}
          title="Add a school first"
          description="Units live inside a school — create the school on the Schools tab, then come back to add its units."
        />
      ) : units.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-6" aria-hidden />}
          title="No units yet"
          description='Create your first unit (e.g. code "BIO205", name "Biochemistry of Plants", Year 2) — then file topics under it from the Topics tab.'
          action={
            <Button type="button" onClick={openCreate} className="focus-ring">
              <Plus className="size-4" aria-hidden />
              New unit
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.school.id}>
              <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
                <GraduationCap className="size-3.5" aria-hidden />
                {group.school.shortName || group.school.name}
                <span className="text-muted-foreground/60">· {group.school.name}</span>
              </p>
              <div className="space-y-4">
                {group.years.map((entry) => (
                  <div key={entry.year}>
                    <p className="text-muted-foreground/80 mb-1.5 text-xs font-medium">
                      Year {entry.year}
                    </p>
                    <div className="glass-card divide-border/60 scrollbar-slim max-h-[24rem] divide-y overflow-y-auto">
                      {entry.units.map((unit) => (
                        <div key={unit.id} className="flex items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-[11px]">
                                {unit.code}
                              </Badge>
                              <p className="truncate font-medium">{unit.name}</p>
                              {unit.semester ? (
                                <Badge variant="outline" className="text-[10px]">
                                  Sem {unit.semester}
                                </Badge>
                              ) : null}
                              {!unit.isActive ? (
                                <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                  Inactive
                                </Badge>
                              ) : null}
                            </div>
                            {unit.description ? (
                              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                                {unit.description}
                              </p>
                            ) : null}
                            <p className="text-muted-foreground/80 mt-0.5 flex items-center gap-1 text-xs">
                              <BookOpen className="size-3" aria-hidden />
                              {unit.topicsCount} {unit.topicsCount === 1 ? "topic" : "topics"} ·{" "}
                              {unit.notesCount} {unit.notesCount === 1 ? "note" : "notes"}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(unit)}
                              className="focus-ring size-8"
                              aria-label={`Edit ${unit.code}`}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleting(unit)}
                              className="focus-ring text-destructive size-8"
                              aria-label={`Delete ${unit.code}`}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
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
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit unit" : "New unit"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Changing the code changes what students see and what the importer matches — keep codes stable once content is filed."
                : 'Give the unit its official code and name, and the school + year it belongs to — e.g. "BIO205 · Biochemistry of Plants · Year 2".'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-school">School</Label>
              <Select
                value={form.schoolId}
                onValueChange={(schoolId) => setForm({ ...form, schoolId })}
              >
                <SelectTrigger id="unit-school" aria-label="Choose the school">
                  <SelectValue placeholder="Choose a school" />
                </SelectTrigger>
                <SelectContent>
                  {schools.map((school) => (
                    <SelectItem key={school.id} value={school.id}>
                      {school.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unit-code">Unit code</Label>
                <Input
                  id="unit-code"
                  value={form.code}
                  maxLength={40}
                  onChange={(event) =>
                    setForm({ ...form, code: event.target.value.toUpperCase() })
                  }
                  placeholder="BIO 205"
                />
                <p className="text-muted-foreground text-[11px]">
                  Stored as <span className="font-mono">{form.code.replace(/\s+/g, "") || "BIO205"}</span>
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit-name">Unit name</Label>
                <Input
                  id="unit-name"
                  value={form.name}
                  maxLength={160}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Biochemistry of Plants"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="unit-year">Study year</Label>
                <Select value={form.year} onValueChange={(year) => setForm({ ...form, year })}>
                  <SelectTrigger id="unit-year" aria-label="Choose the study year">
                    <SelectValue placeholder="Year" />
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
              <div className="space-y-2">
                <Label htmlFor="unit-semester">Semester (optional)</Label>
                <Select
                  value={form.semester}
                  onValueChange={(semester) => setForm({ ...form, semester })}
                >
                  <SelectTrigger id="unit-semester" aria-label="Choose the semester">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole year</SelectItem>
                    <SelectItem value="1">Semester 1</SelectItem>
                    <SelectItem value="2">Semester 2</SelectItem>
                    <SelectItem value="3">Semester 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit-description">Description (optional)</Label>
              <Textarea
                id="unit-description"
                rows={2}
                maxLength={500}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="One line students see when browsing the unit"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveUnit()} disabled={busy} className="focus-ring">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {editingId ? "Save changes" : "Create unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Delete confirmation ---------- */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              The unit is removed from the student browse pages. Its{" "}
              {deleting?.topicsCount ?? 0} {deleting?.topicsCount === 1 ? "topic" : "topics"} and
              every note inside are kept — they just lose the unit tag. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteUnit();
              }}
              disabled={deleteBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete unit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
