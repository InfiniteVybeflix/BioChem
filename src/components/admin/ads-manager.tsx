"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Copy, Loader2, Megaphone, Pencil, Plus, ToggleLeft, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { adSchema } from "@/lib/validation";
import type { AdPlacement } from "@/types/domain";
import type { z } from "zod";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";

export interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

export interface AdRow {
  id: string;
  title: string;
  body: string;
  placement: AdPlacement;
  targetUrl: string;
  imageUrl: string | null;
  ctaLabel: string;
  startsAt: string;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  enabled: boolean;
}

const PLACEMENTS: { value: AdPlacement; label: string; hint: string }[] = [
  { value: "banner", label: "Banner", hint: "Wide strip at the top of the dashboard" },
  { value: "sidebar", label: "Sidebar", hint: "Compact card in the dashboard side rail" },
  { value: "jobs", label: "Jobs", hint: "Card under the job board listings" },
  { value: "events", label: "Events", hint: "Card at the bottom of Discussions" },
  { value: "resources", label: "Resources", hint: "Card under the past papers list" },
];

const PLACEMENT_LABELS: Record<AdPlacement, string> = Object.fromEntries(
  PLACEMENTS.map((placement) => [placement.value, placement.label]),
) as Record<AdPlacement, string>;

const FLAG_LABELS: Record<string, string> = {
  ads_enabled: "Sponsored placements",
  sponsorships: "Sponsorships",
  ai_tutor: "AI tutor",
  question_of_the_day: "Question of the day",
  auto_flashcards: "Auto flashcards",
  community_chat: "Community chat",
  job_board: "Job board",
};

type AdFormInput = z.input<typeof adSchema>;

const EMPTY_AD: AdFormInput = {
  title: "",
  body: "",
  placement: "banner",
  targetUrl: "",
  imageUrl: null,
  ctaLabel: "Learn more",
  endsAt: null,
  enabled: true,
};

async function readError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }
  return fallback;
}

/**
 * Admin ads & flags manager: the feature-flag switches plus the sponsored
 * placements table (create / edit / duplicate / enable / delete) — every
 * mutation goes through the console ads API and updates the table in place,
 * so placements created here reach students within a minute (the AdSlot
 * component re-syncs automatically).
 */
export function AdsManager({
  initialFlags,
  initialAds,
}: {
  initialFlags: FlagRow[];
  initialAds: AdRow[];
}) {
  const base = useConsoleBase();
  const [flags, setFlags] = useState(initialFlags);
  const [ads, setAds] = useState(initialAds);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // null id → create; string id → edit of that placement.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AdFormInput>(EMPTY_AD);

  const toggleFlag = async (flag: FlagRow, enabled: boolean) => {
    setFlagBusy(flag.key);
    try {
      const response = await fetch(consoleUrl(base, "api/ads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag", key: flag.key, enabled }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't update the flag"));
        return;
      }
      setFlags((prev) =>
        prev.map((entry) => (entry.key === flag.key ? { ...entry, enabled } : entry)),
      );
      toast.success(`${FLAG_LABELS[flag.key] ?? flag.key} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setFlagBusy(null);
    }
  };

  const toggleAd = async (ad: AdRow, enabled: boolean) => {
    const previous = ads;
    setAds((prev) => prev.map((entry) => (entry.id === ad.id ? { ...entry, enabled } : entry)));
    try {
      const response = await fetch(consoleUrl(base, "api/ads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: ad.id, enabled }),
      });
      if (!response.ok) {
        setAds(previous);
        toast.error(await readError(response, "Couldn't update the placement"));
        return;
      }
      toast.success(enabled ? "Placement enabled" : "Placement disabled");
    } catch {
      setAds(previous);
      toast.error("Network error — try again");
    }
  };

  const deleteAd = async (ad: AdRow) => {
    setDeleteBusy(ad.id);
    try {
      const response = await fetch(consoleUrl(base, "api/ads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: ad.id }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't delete the placement"));
        return;
      }
      setAds((prev) => prev.filter((entry) => entry.id !== ad.id));
      toast.success("Placement deleted");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDeleteBusy(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_AD);
    setDialogOpen(true);
  };

  const openEdit = (ad: AdRow) => {
    setEditingId(ad.id);
    setForm({
      title: ad.title,
      body: ad.body,
      placement: ad.placement,
      targetUrl: ad.targetUrl,
      imageUrl: ad.imageUrl,
      ctaLabel: ad.ctaLabel,
      // datetime-local inputs need the local "YYYY-MM-DDTHH:mm" slice.
      endsAt: ad.endsAt ? new Date(ad.endsAt).toISOString().slice(0, 16) : null,
      enabled: ad.enabled,
    });
    setDialogOpen(true);
  };

  const openDuplicate = (ad: AdRow) => {
    setEditingId(null);
    setForm({
      title: `${ad.title} (copy)`,
      body: ad.body,
      placement: ad.placement,
      targetUrl: ad.targetUrl,
      imageUrl: ad.imageUrl,
      ctaLabel: ad.ctaLabel,
      endsAt: ad.endsAt ? new Date(ad.endsAt).toISOString().slice(0, 16) : null,
      enabled: false, // duplicates start paused so they can be reviewed first
    });
    setDialogOpen(true);
  };

  const saveAd = async () => {
    const endsAtIso = form.endsAt ? new Date(form.endsAt).toISOString() : null;
    const candidate = {
      title: form.title.trim(),
      body: form.body.trim(),
      placement: form.placement,
      targetUrl: form.targetUrl.trim(),
      imageUrl: form.imageUrl?.trim() ? form.imageUrl.trim() : null,
      ctaLabel: (form.ctaLabel ?? "").trim() || "Learn more",
      endsAt: endsAtIso,
      enabled: form.enabled,
    };
    const parsed = adSchema.safeParse(candidate);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the placement details");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/ads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { action: "update", id: editingId, ...parsed.data }
            : { action: "create", ...parsed.data },
        ),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't save the placement"));
        return;
      }
      const data = (await response.json()) as { ad: AdRow };
      setAds((prev) =>
        editingId
          ? prev.map((entry) => (entry.id === editingId ? data.ad : entry))
          : [data.ad, ...prev],
      );
      toast.success(editingId ? "Placement updated" : "Sponsored placement created");
      setDialogOpen(false);
      setForm(EMPTY_AD);
      setEditingId(null);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* ---------- Feature flags ---------- */}
      <section aria-labelledby="flags-heading">
        <h2
          id="flags-heading"
          className="font-heading flex items-center gap-2 text-lg font-semibold"
        >
          <ToggleLeft className="text-primary size-4.5" aria-hidden />
          Feature flags
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Platform switches — changes apply immediately for every user.
        </p>
        <div className="glass-card divide-border/60 mt-4 divide-y">
          {flags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="font-medium">{FLAG_LABELS[flag.key] ?? flag.key}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {flag.description ?? flag.key}
                </p>
              </div>
              <Switch
                checked={flag.enabled}
                onCheckedChange={(checked) => void toggleFlag(flag, checked)}
                disabled={flagBusy === flag.key}
                aria-label={`Toggle ${FLAG_LABELS[flag.key] ?? flag.key}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Sponsored placements ---------- */}
      <section aria-labelledby="ads-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="ads-heading"
              className="font-heading flex items-center gap-2 text-lg font-semibold"
            >
              <Megaphone className="text-primary size-4.5" aria-hidden />
              Sponsored placements
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Appear in their slot within a minute of saving, while the{" "}
              <strong>ads_enabled</strong> flag is on. (The separate{" "}
              <strong>sponsorships</strong> flag only controls sponsored job listings.)
            </p>
          </div>
          <Button type="button" onClick={openCreate} className="focus-ring">
            <Plus className="size-4" aria-hidden />
            New placement
          </Button>
        </div>

        {ads.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" aria-hidden />}
            title="No sponsored placements"
            description="Create one to promote a course, event or resource — it appears in the chosen slot once ads_enabled is on."
            action={
              <Button type="button" onClick={openCreate} className="focus-ring">
                <Plus className="size-4" aria-hidden />
                New placement
              </Button>
            }
          />
        ) : (
          <div className="glass-card scrollbar-slim mt-4 max-h-96 overflow-auto">
            <Table>
              <TableHeader className="bg-card/95 sticky top-0 z-10 backdrop-blur">
                <TableRow>
                  <TableHead>Placement</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead className="text-right">Impr.</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead>Ends</TableHead>
                  <TableHead>Live</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell className="max-w-[14rem]">
                      <span className="block truncate font-medium">{ad.title}</span>
                      <Badge variant="outline" className="mt-1">
                        {PLACEMENT_LABELS[ad.placement] ?? ad.placement}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[12rem]">
                      <a
                        href={ad.targetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring text-primary block truncate text-xs underline underline-offset-2"
                      >
                        {ad.targetUrl}
                      </a>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ad.impressions}</TableCell>
                    <TableCell className="text-right tabular-nums">{ad.clicks}</TableCell>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {ad.endsAt ? format(new Date(ad.endsAt), "d MMM yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={ad.enabled}
                        onCheckedChange={(checked) => void toggleAd(ad, checked)}
                        aria-label={`Toggle ${ad.title}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(ad)}
                          className="focus-ring size-8"
                          aria-label={`Edit ${ad.title}`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openDuplicate(ad)}
                          className="focus-ring size-8"
                          aria-label={`Duplicate ${ad.title}`}
                        >
                          <Copy className="size-4" aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={deleteBusy === ad.id}
                          onClick={() => void deleteAd(ad)}
                          className="focus-ring text-destructive size-8"
                          aria-label={`Delete ${ad.title}`}
                        >
                          {deleteBusy === ad.id ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Trash2 className="size-4" aria-hidden />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------- Create / edit dialog ---------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(EMPTY_AD);
          }
        }}
      >
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit sponsored placement" : "New sponsored placement"}
            </DialogTitle>
            <DialogDescription>
              Validated with the shared ad schema. Live placements render in their slot within a
              minute once the ads_enabled flag is on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ad-title">Title</Label>
              <Input
                id="ad-title"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ad-body">Body</Label>
              <Textarea
                id="ad-body"
                value={form.body}
                onChange={(event) => setForm({ ...form, body: event.target.value })}
                maxLength={600}
                className="min-h-20"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ad-placement">Placement</Label>
                <Select
                  value={form.placement}
                  onValueChange={(placement) =>
                    setForm({ ...form, placement: placement as AdPlacement })
                  }
                >
                  <SelectTrigger id="ad-placement" aria-label="Choose placement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACEMENTS.map((placement) => (
                      <SelectItem key={placement.value} value={placement.value}>
                        {placement.label} — {placement.hint}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-target">Target URL</Label>
                <Input
                  id="ad-target"
                  type="url"
                  value={form.targetUrl}
                  onChange={(event) => setForm({ ...form, targetUrl: event.target.value })}
                  placeholder="https://…"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ad-image">Image URL (optional)</Label>
                <Input
                  id="ad-image"
                  type="url"
                  value={form.imageUrl ?? ""}
                  onChange={(event) => setForm({ ...form, imageUrl: event.target.value || null })}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ad-cta">CTA label</Label>
                <Input
                  id="ad-cta"
                  value={form.ctaLabel ?? ""}
                  onChange={(event) => setForm({ ...form, ctaLabel: event.target.value })}
                  maxLength={40}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ad-ends">Ends at (optional)</Label>
              <Input
                id="ad-ends"
                type="datetime-local"
                value={form.endsAt ?? ""}
                onChange={(event) => setForm({ ...form, endsAt: event.target.value || null })}
              />
            </div>
            <div className="border-border flex items-center justify-between rounded-xl border px-4 py-3">
              <Label htmlFor="ad-enabled">Enabled immediately</Label>
              <Switch
                id="ad-enabled"
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void saveAd()}
              disabled={busy}
              className="focus-ring"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {editingId ? "Save changes" : "Create placement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
