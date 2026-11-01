"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Copy,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  ToggleLeft,
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
import { AdCard, type AdCardSize } from "@/components/ads/ad-card";
import { EmptyState } from "@/components/common/ui-bits";
import { adSchema } from "@/lib/validation";
import type { AdPlacement } from "@/types/domain";
import type { z } from "zod";
import { cn } from "@/lib/utils";
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
  placements: AdPlacement[];
  size: AdCardSize;
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
  { value: "banner", label: "Dashboard banner", hint: "Wide strip at the top of the student dashboard" },
  { value: "sidebar", label: "Dashboard sidebar", hint: "Compact card in the dashboard side rail" },
  { value: "jobs", label: "Jobs page", hint: "Card under the job board listings" },
  { value: "events", label: "Discussions", hint: "Card at the bottom of the community page" },
  { value: "resources", label: "Past papers", hint: "Card under the past papers list" },
];

const PLACEMENT_LABELS: Record<AdPlacement, string> = Object.fromEntries(
  PLACEMENTS.map((placement) => [placement.value, placement.label]),
) as Record<AdPlacement, string>;

const SIZES: { value: AdCardSize; label: string; hint: string }[] = [
  { value: "compact", label: "Compact", hint: "Slim card, small text" },
  { value: "standard", label: "Standard", hint: "The default card size" },
  { value: "large", label: "Large", hint: "Roomy card with a bigger image" },
];

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
  placements: ["banner"],
  size: "standard",
  targetUrl: "",
  imageUrl: null,
  ctaLabel: "Learn more",
  endsAt: null,
  enabled: true,
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
  return server ? `${server} (HTTP ${response.status})` : `${fallback} (HTTP ${response.status})`;
}

/**
 * Live placement preview: a miniature student dashboard so the operator
 * can see exactly where the card will appear (and what the unselected
 * slots look like) before saving.
 */
function PlacementPreview({
  selected,
  size,
  ad,
}: {
  selected: AdPlacement[];
  size: AdCardSize;
  ad: { title: string; body: string; ctaLabel: string; imageUrl: string | null };
}) {
  const slots: { placement: AdPlacement; label: string }[] = [
    { placement: "banner", label: "Dashboard banner" },
    { placement: "sidebar", label: "Dashboard sidebar" },
    { placement: "jobs", label: "Jobs page" },
    { placement: "events", label: "Discussions" },
    { placement: "resources", label: "Past papers" },
  ];

  const renderSlot = (placement: AdPlacement, label: string, variant: "banner" | "sidebar" | "card") => {
    const active = selected.includes(placement);
    return (
      <div key={placement} className="min-w-0">
        <p
          className={cn(
            "mb-1 text-[10px] font-semibold tracking-wide uppercase",
            active ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground/60",
          )}
        >
          {label}
        </p>
        {active ? (
          <div className="rounded-xl ring-2 ring-amber-500/40">
            <AdCard
              ad={ad}
              variant={variant}
              size={size}
              className={cn(
                "pointer-events-none select-none",
                variant === "card" && "max-w-none",
              )}
            />
          </div>
        ) : (
          <div className="border-border/70 text-muted-foreground/50 flex h-16 items-center justify-center rounded-xl border border-dashed text-[11px]">
            Not included — stays empty
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-background/60 border-border space-y-4 rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs font-medium">
        Preview — where this ad will appear ({selected.length}{" "}
        {selected.length === 1 ? "slot" : "slots"})
      </p>
      {renderSlot("banner", "Dashboard banner", "banner")}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-4">
          {renderSlot("jobs", "Jobs page", "card")}
          {renderSlot("events", "Discussions", "card")}
          {renderSlot("resources", "Past papers", "card")}
        </div>
        <div>{renderSlot("sidebar", "Dashboard sidebar", "sidebar")}</div>
      </div>
    </div>
  );
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

  const adsEnabled = flags.find((flag) => flag.key === "ads_enabled")?.enabled ?? false;

  const togglePlacement = (placement: AdPlacement, on: boolean) => {
    const current = form.placements ?? [];
    if (on && !current.includes(placement)) {
      setForm({ ...form, placements: [...current, placement] });
    } else if (!on && current.includes(placement)) {
      // Never allow removing the last placement — the schema needs one.
      if (current.length === 1) {
        toast.error("Keep at least one placement selected");
        return;
      }
      setForm({ ...form, placements: current.filter((entry) => entry !== placement) });
    }
  };

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
      placements: ad.placements.length > 0 ? ad.placements : ["banner"],
      size: ad.size,
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
      placements: ad.placements.length > 0 ? ad.placements : ["banner"],
      size: ad.size,
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
      placements: form.placements ?? [],
      size: form.size ?? "standard",
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

  const previewAd = {
    title: form.title.trim() || "Your ad title",
    body: form.body.trim() || "The ad body students will read.",
    ctaLabel: (form.ctaLabel ?? "").trim() || "Learn more",
    imageUrl: form.imageUrl?.trim() ? form.imageUrl.trim() : null,
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
              <strong>ads_enabled</strong> flag is on. One ad can fill several slots; pick the
              slots and size in the editor. (The separate <strong>sponsorships</strong> flag only
              controls sponsored job listings.)
            </p>
          </div>
          <Button type="button" onClick={openCreate} className="focus-ring">
            <Plus className="size-4" aria-hidden />
            New placement
          </Button>
        </div>

        {!adsEnabled ? (
          <div className="border-amber-500/40 bg-amber-500/10 mt-4 flex items-start gap-3 rounded-xl border p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="text-sm">
              <strong>Sponsored placements are switched off</strong> — students see no ads right
              now, even enabled ones. Turn on the <strong>Sponsored placements</strong> flag above
              to put them live.
            </p>
          </div>
        ) : null}

        {ads.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" aria-hidden />}
            title="No sponsored placements"
            description="Create one to promote a course, event or resource — it appears in every slot you select once ads_enabled is on."
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
                  <TableHead>Ad</TableHead>
                  <TableHead>Slots</TableHead>
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
                    <TableCell className="max-w-[13rem]">
                      <span className="block truncate font-medium">{ad.title}</span>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">
                          {ad.size}
                        </Badge>
                        {ad.enabled ? null : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px]">
                            paused
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[10rem]">
                      <div className="flex flex-wrap gap-1">
                        {ad.placements.slice(0, 2).map((placement) => (
                          <Badge key={placement} variant="secondary" className="text-[10px]">
                            {PLACEMENT_LABELS[placement] ?? placement}
                          </Badge>
                        ))}
                        {ad.placements.length > 2 ? (
                          <Badge variant="secondary" className="text-[10px]">
                            +{ad.placements.length - 2} more
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[10rem]">
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
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit sponsored placement" : "New sponsored placement"}
            </DialogTitle>
            <DialogDescription>
              Pick every slot this ad should fill, adjust its size, and check the live preview —
              students see exactly this. Live placements render within a minute once the
              ads_enabled flag is on.
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

            <div className="space-y-2">
              <Label>Placements — choose every slot this ad fills</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLACEMENTS.map((placement) => {
                  const checked = (form.placements ?? []).includes(placement.value);
                  return (
                    <label
                      key={placement.value}
                      className={cn(
                        "border-border hover:border-primary/50 flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors",
                        checked && "border-primary/60 bg-primary/5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          togglePlacement(placement.value, event.target.checked)
                        }
                        className="accent-primary mt-0.5"
                        aria-label={placement.label}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{placement.label}</span>
                        <span className="text-muted-foreground block text-xs">
                          {placement.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ad-size">Card size</Label>
                <Select
                  value={form.size ?? "standard"}
                  onValueChange={(size) => setForm({ ...form, size: size as AdCardSize })}
                >
                  <SelectTrigger id="ad-size" aria-label="Choose the card size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((size) => (
                      <SelectItem key={size.value} value={size.value}>
                        {size.label} — {size.hint}
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

            <PlacementPreview
              selected={form.placements ?? []}
              size={form.size ?? "standard"}
              ad={previewAd}
            />
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
