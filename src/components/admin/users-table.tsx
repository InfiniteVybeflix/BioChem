"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  BadgeCheck,
  KeyRound,
  Loader2,
  Search,
  ShieldAlert,
  ShieldOff,
  UserCog,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/common/ui-bits";
import type { UserRole } from "@/types/domain";
import {
  ABILITY_LABELS,
  ABILITY_PRESETS,
  GRANTABLE_ABILITIES,
  type Capability,
} from "@/lib/rbac";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

export interface AdminUserRow {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  xp: number;
  streak: number;
  suspended: boolean;
  approved: boolean;
  staffAbilities: string[];
  schoolName: string | null;
  yearOfStudy: number | null;
  createdAt: string;
  lastActiveDate: string | null;
}

const ROLE_BADGE_CLASS: Partial<Record<UserRole, string>> = {
  student: "border-border bg-muted text-foreground",
  lecturer: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

type ActionKind = "set_role" | "suspend" | "unsuspend" | "approve";

interface PendingAction {
  kind: ActionKind;
  user: AdminUserRow;
  nextRole?: UserRole;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

/**
 * Operations console — user directory. Client-side search, staff
 * approval, role changes and suspend/restore. Every action goes to
 * the relative `api/users` endpoint (resolved under the console's
 * private path) and updates the table optimistically on success.
 */
export function UsersTable({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const base = useConsoleBase();
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending_staff" | "suspended" | "lecturer">("all");
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Abilities editor.
  const [abilitiesUser, setAbilitiesUser] = useState<AdminUserRow | null>(null);
  const [selectedAbilities, setSelectedAbilities] = useState<Capability[]>([]);
  const [abilitiesBusy, setAbilitiesBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((user) => {
      if (filter === "pending_staff" && (user.role !== "lecturer" || user.approved)) return false;
      if (filter === "suspended" && !user.suspended) return false;
      if (filter === "lecturer" && user.role !== "lecturer") return false;
      if (needle.length === 0) return true;
      return (
        user.fullName.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle)
      );
    });
  }, [users, search, filter]);

  const openAction = (action: PendingAction) => {
    setReason("");
    setPending(action);
  };

  const openAbilities = (user: AdminUserRow) => {
    setSelectedAbilities(
      user.staffAbilities.filter((ability): ability is Capability =>
        (GRANTABLE_ABILITIES as readonly string[]).includes(ability),
      ),
    );
    setAbilitiesUser(user);
  };

  const toggleAbility = (ability: Capability) => {
    setSelectedAbilities((prev) =>
      prev.includes(ability)
        ? prev.filter((entry) => entry !== ability)
        : [...prev, ability],
    );
  };

  const saveAbilities = async () => {
    if (!abilitiesUser) return;
    setAbilitiesBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: abilitiesUser.id,
          action: "set_abilities",
          abilities: selectedAbilities,
        }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't update the abilities"));
        return;
      }
      setUsers((prev) =>
        prev.map((user) =>
          user.id === abilitiesUser.id ? { ...user, staffAbilities: selectedAbilities } : user,
        ),
      );
      toast.success(
        selectedAbilities.length > 0
          ? `${abilitiesUser.fullName} now has ${selectedAbilities.length} extra abilit${selectedAbilities.length === 1 ? "y" : "ies"}`
          : `Abilities cleared for ${abilitiesUser.fullName}`,
      );
      setAbilitiesUser(null);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setAbilitiesBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;

    const body: Record<string, unknown> = {
      userId: pending.user.id,
      action: pending.kind,
    };
    if (pending.kind === "set_role" && pending.nextRole) body.role = pending.nextRole;
    if (pending.kind === "suspend" && reason.trim()) body.reason = reason.trim();

    setBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't update the user"));
        return;
      }
      setUsers((prev) =>
        prev.map((user) =>
          user.id === pending.user.id
            ? {
                ...user,
                role:
                  pending.kind === "set_role" && pending.nextRole ? pending.nextRole : user.role,
                approved: pending.kind === "approve" ? true : user.approved,
                suspended:
                  pending.kind === "suspend"
                    ? true
                    : pending.kind === "unsuspend"
                      ? false
                      : user.suspended,
              }
            : user,
        ),
      );
      if (pending.kind === "set_role")
        toast.success(`${pending.user.fullName} is now a ${pending.nextRole}`);
      else if (pending.kind === "approve")
        toast.success(`${pending.user.fullName} can now sign in as staff`);
      else if (pending.kind === "suspend") toast.success(`${pending.user.fullName} is suspended`);
      else toast.success(`${pending.user.fullName} is restored`);
      setPending(null);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            aria-label="Search users by name or email"
            placeholder="Search by name or email…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter users">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="pending_staff">Staff awaiting approval</SelectItem>
            <SelectItem value="lecturer">All staff</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No users match"
          description="Try a different search or filter — new sign-ups appear here in realtime."
        />
      ) : (
        <div className="glass-card overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">School</TableHead>
                <TableHead className="hidden lg:table-cell">XP</TableHead>
                <TableHead className="hidden lg:table-cell">Last active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => (
                <TableRow key={user.id} className={user.suspended ? "opacity-60" : undefined}>
                  <TableCell>
                    <p className="font-medium">{user.fullName}</p>
                    <p className="text-muted-foreground text-xs">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={ROLE_BADGE_CLASS[user.role]}>
                        {user.role}
                      </Badge>
                      {user.role === "lecturer" && !user.approved ? (
                        <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          awaiting approval
                        </Badge>
                      ) : null}
                      {user.staffAbilities.length > 0 ? (
                        <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400">
                          <KeyRound className="size-3" aria-hidden />
                          {user.staffAbilities.length} abilit{user.staffAbilities.length === 1 ? "y" : "ies"}
                        </Badge>
                      ) : null}
                      {user.suspended ? <Badge variant="destructive">suspended</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                    {user.schoolName ? (
                      <>
                        {user.schoolName}
                        {user.yearOfStudy ? ` · Y${user.yearOfStudy}` : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{user.xp}</TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                    {user.lastActiveDate
                      ? formatDistanceToNow(new Date(user.lastActiveDate), { addSuffix: true })
                      : "never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {user.role === "lecturer" && !user.approved ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => openAction({ kind: "approve", user })}
                        >
                          <BadgeCheck className="size-4" aria-hidden />
                          Approve
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        aria-label={`Change role for ${user.fullName}`}
                        onClick={() =>
                          openAction({
                            kind: "set_role",
                            user,
                            nextRole: user.role === "student" ? "lecturer" : "student",
                          })
                        }
                      >
                        <UserCog className="size-4" aria-hidden />
                        <span className="hidden sm:inline">
                          {user.role === "student" ? "Make staff" : "Make student"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        aria-label={`Manage abilities for ${user.fullName}`}
                        onClick={() => openAbilities(user)}
                      >
                        <KeyRound className="size-4" aria-hidden />
                        <span className="hidden sm:inline">Abilities</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1.5"
                        aria-label={
                          user.suspended ? `Restore ${user.fullName}` : `Suspend ${user.fullName}`
                        }
                        onClick={() =>
                          openAction({
                            kind: user.suspended ? "unsuspend" : "suspend",
                            user,
                          })
                        }
                      >
                        {user.suspended ? (
                          <ShieldOff className="size-4" aria-hidden />
                        ) : (
                          <ShieldAlert className="size-4" aria-hidden />
                        )}
                        <span className="hidden sm:inline">
                          {user.suspended ? "Restore" : "Suspend"}
                        </span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pending?.kind === "approve"
                ? `Approve ${pending.user.fullName} as staff?`
                : pending?.kind === "set_role"
                  ? `Change ${pending.user.fullName} to ${pending.nextRole}?`
                  : pending?.kind === "suspend"
                    ? `Suspend ${pending?.user.fullName ?? "this user"}?`
                    : `Restore ${pending?.user.fullName ?? "this user"}?`}
            </DialogTitle>
            <DialogDescription>
              {pending?.kind === "approve"
                ? "They will be able to sign in and publish notes, questions and exams."
                : pending?.kind === "set_role"
                  ? "Staff can publish content directly and see class analytics. Students submit content for review."
                  : pending?.kind === "suspend"
                    ? "They will be signed out and blocked from the platform until restored."
                    : "Full access is restored immediately."}
            </DialogDescription>
          </DialogHeader>
          {pending?.kind === "suspend" ? (
            <div className="space-y-2">
              <Label htmlFor="suspend-reason">Reason (stored, shown to the user)</Label>
              <Input
                id="suspend-reason"
                placeholder="e.g. Repeated spam in community discussions"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={pending?.kind === "suspend" ? "destructive" : "default"}
              onClick={() => void confirm()}
              disabled={busy}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Abilities editor ---------- */}
      <Dialog
        open={abilitiesUser !== null}
        onOpenChange={(open) => {
          if (!open) setAbilitiesUser(null);
        }}
      >
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Abilities for {abilitiesUser?.fullName}</DialogTitle>
            <DialogDescription>
              Grant a student part of the lecturer toolset — e.g. make them class rep — without
              changing their role. They keep every student feature.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ABILITY_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="focus-ring"
                  disabled={abilitiesBusy}
                  onClick={() => setSelectedAbilities(preset.abilities)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="divide-border/60 rounded-xl border">
              {GRANTABLE_ABILITIES.map((ability) => {
                const checked = selectedAbilities.includes(ability);
                return (
                  <label
                    key={ability}
                    className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl hover:bg-muted/40"
                  >
                    <span>
                      <span className="font-medium">{ABILITY_LABELS[ability]}</span>
                      <span className="text-muted-foreground block text-xs">{ability}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAbility(ability)}
                      disabled={abilitiesBusy}
                      className="accent-primary size-4"
                      aria-label={ABILITY_LABELS[ability]}
                    />
                  </label>
                );
              })}
            </div>

            <p className="text-muted-foreground text-xs">
              Ability holders reach the Lecturer panel sections their abilities unlock
              (moderate chat, class analytics, publishing…) and are verified in the answer
              badges they leave.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAbilitiesUser(null)}
              disabled={abilitiesBusy}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveAbilities()} disabled={abilitiesBusy}>
              {abilitiesBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save abilities
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
