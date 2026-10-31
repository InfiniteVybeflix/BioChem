"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, GraduationCap, Loader2, Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/common/ui-bits";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

/**
 * Console — schools & the academic-year timeline.
 *
 * Everything the landing page's "Supported schools" section shows is
 * controlled here: add a school, set how many years its programme
 * runs, and set the moment the academic year turns over. When that
 * moment passes (or you press "Advance now"), every student of the
 * school moves up a year and their dashboard re-personalises — they
 * still keep full access to every other year's material.
 */

export interface SchoolRow {
  id: string;
  name: string;
  shortName: string;
  country: string;
  maxYears: number;
  currentAcademicYear: string;
  yearAdvanceAt: string | null;
  isActive: boolean;
  students: number;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

export function SchoolsManager({ initialSchools }: { initialSchools: SchoolRow[] }) {
  const base = useConsoleBase();
  const [schools, setSchools] = useState<SchoolRow[]>(initialSchools);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [advanceTarget, setAdvanceTarget] = useState<SchoolRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SchoolRow | null>(null);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    name: "",
    shortName: "",
    country: "Kenya",
    maxYears: 4,
    currentAcademicYear: "",
  });

  const post = async (body: Record<string, unknown>): Promise<boolean> => {
    const response = await fetch(consoleUrl(base, "api/schools"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      toast.error(await readError(response, "Action failed"));
      return false;
    }
    return true;
  };

  const create = async () => {
    setCreating(true);
    const ok = await post({ action: "create", ...form });
    setCreating(false);
    if (!ok) return;
    toast.success(`${form.name} added — students can now pick it during onboarding`);
    setCreateOpen(false);
    setForm({ name: "", shortName: "", country: "Kenya", maxYears: 4, currentAcademicYear: "" });
    window.location.reload();
  };

  const patchSchool = async (school: SchoolRow, patch: Partial<SchoolRow>) => {
    setBusyId(school.id);
    const body: Record<string, unknown> = { action: "update", id: school.id };
    if (patch.name !== undefined) body["name"] = patch.name;
    if (patch.shortName !== undefined) body["shortName"] = patch.shortName;
    if (patch.country !== undefined) body["country"] = patch.country;
    if (patch.maxYears !== undefined) body["maxYears"] = patch.maxYears;
    if (patch.currentAcademicYear !== undefined)
      body["currentAcademicYear"] = patch.currentAcademicYear;
    if (patch.isActive !== undefined) body["isActive"] = patch.isActive;
    if (patch.yearAdvanceAt !== undefined) {
      body["yearAdvanceAt"] = patch.yearAdvanceAt
        ? new Date(patch.yearAdvanceAt).toISOString()
        : null;
    }
    const ok = await post(body);
    setBusyId(null);
    if (ok)
      setSchools((prev) => prev.map((row) => (row.id === school.id ? { ...row, ...patch } : row)));
  };

  const advanceNow = async (school: SchoolRow) => {
    setBusyId(school.id);
    const response = await fetch(consoleUrl(base, "api/schools"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "advance_year", id: school.id }),
    });
    setBusyId(null);
    if (!response.ok) {
      toast.error(await readError(response, "Could not advance the year"));
      return;
    }
    const data: { studentsAdvanced?: number } = await response.json().catch(() => ({}));
    toast.success(
      `Academic year advanced — ${data.studentsAdvanced ?? 0} student(s) moved up. Dashboards re-personalise on next visit.`,
    );
    setAdvanceTarget(null);
    window.location.reload();
  };

  const removeSchool = async (school: SchoolRow) => {
    setBusyId(school.id);
    const ok = await post({ action: "delete", id: school.id });
    setBusyId(null);
    if (ok) {
      toast.success(`${school.name} removed`);
      setSchools((prev) => prev.filter((row) => row.id !== school.id));
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <GraduationCap className="size-4" aria-hidden /> Supported schools
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Students pick from this list during onboarding; the landing page shows the active ones.
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden /> Add school
        </Button>
      </div>

      {schools.length === 0 ? (
        <EmptyState
          title="No schools yet"
          description="Add your first school — its students can then sign up, onboard and see content scoped to their year."
          icon={<GraduationCap className="size-8" aria-hidden />}
        />
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {schools.map((school) => (
            <li key={school.id} className="glass-card space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{school.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {school.shortName} · {school.country} · {school.students} student
                    {school.students === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={school.isActive}
                    onCheckedChange={(checked) => void patchSchool(school, { isActive: checked })}
                    disabled={busyId === school.id}
                    aria-label={`Toggle ${school.name} on the public list`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${school.name}`}
                    onClick={() => setDeleteTarget(school)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Programme length (years)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={school.maxYears}
                    disabled={busyId === school.id}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (value >= 1 && value <= 8) {
                        setSchools((prev) =>
                          prev.map((row) =>
                            row.id === school.id ? { ...row, maxYears: value } : row,
                          ),
                        );
                      }
                    }}
                    onBlur={() => void patchSchool(school, { maxYears: school.maxYears })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Current academic year</Label>
                  <Input
                    placeholder="e.g. 2025/2026"
                    value={school.currentAcademicYear}
                    disabled={busyId === school.id}
                    onChange={(event) =>
                      setSchools((prev) =>
                        prev.map((row) =>
                          row.id === school.id
                            ? { ...row, currentAcademicYear: event.target.value }
                            : row,
                        ),
                      )
                    }
                    onBlur={() =>
                      void patchSchool(school, { currentAcademicYear: school.currentAcademicYear })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-xs">
                  <CalendarClock className="size-3.5" aria-hidden />
                  Year rolls over on (the timeline moment)
                </Label>
                <Input
                  type="date"
                  value={school.yearAdvanceAt ? school.yearAdvanceAt.slice(0, 10) : ""}
                  disabled={busyId === school.id}
                  onChange={(event) =>
                    void patchSchool(school, {
                      yearAdvanceAt: event.target.value || null,
                    })
                  }
                />
                <p className="text-muted-foreground text-xs">
                  When this date passes, every student moves up a year automatically and their
                  dashboard re-personalises. Leave empty to manage years manually.
                </p>
              </div>

              <Button
                variant="outline"
                className="gap-2"
                disabled={busyId === school.id || !school.yearAdvanceAt}
                onClick={() => setAdvanceTarget(school)}
              >
                {busyId === school.id ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Rocket className="size-4" aria-hidden />
                )}
                Advance year now
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a school</DialogTitle>
            <DialogDescription>
              Students of this school will see it during onboarding and can pick their year of
              study.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="school-name">Full name</Label>
              <Input
                id="school-name"
                placeholder="e.g. University of Nairobi"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="school-short">Short name</Label>
                <Input
                  id="school-short"
                  placeholder="e.g. UoN"
                  value={form.shortName}
                  onChange={(event) => setForm({ ...form, shortName: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-country">Country</Label>
                <Input
                  id="school-country"
                  value={form.country}
                  onChange={(event) => setForm({ ...form, country: event.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="school-years">Programme length</Label>
                <Input
                  id="school-years"
                  type="number"
                  min={1}
                  max={8}
                  value={form.maxYears}
                  onChange={(event) => setForm({ ...form, maxYears: Number(event.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="school-academic">Current academic year</Label>
                <Input
                  id="school-academic"
                  placeholder="2025/2026"
                  value={form.currentAcademicYear}
                  onChange={(event) =>
                    setForm({ ...form, currentAcademicYear: event.target.value })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              onClick={() => void create()}
              disabled={creating || form.name.trim().length < 2 || form.shortName.trim().length < 1}
            >
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Add school
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance confirmation */}
      <Dialog
        open={advanceTarget !== null}
        onOpenChange={(open) => !open && setAdvanceTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Advance the academic year for {advanceTarget?.name}?</DialogTitle>
            <DialogDescription>
              Every student moves up one year (capped at year {advanceTarget?.maxYears}). Their
              dashboards, notes and exams re-personalise the next time they open the app — nobody
              loses access to other years' material.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAdvanceTarget(null)}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              onClick={() => advanceTarget && void advanceNow(advanceTarget)}
              disabled={busyId !== null}
            >
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Advance now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              Students already enrolled keep their accounts and content; new students will no longer
              be able to pick this school.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={busyId !== null}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && void removeSchool(deleteTarget)}
              disabled={busyId !== null}
            >
              {busyId ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
