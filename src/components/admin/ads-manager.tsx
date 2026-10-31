"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Loader2, Megaphone, Plus, ToggleLeft, Trash2 } from "lucide-react";
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
  ctaLabel: string;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  enabled: boolean;
}

const PLACEMENTS: AdPlacement[] = ["jobs", "events", "resources", "sidebar", "banner"];

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
  placement: "sidebar",
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
 * Admin ads & flags manager: the seven feature-flag switches plus the
 * sponsored placements table (create / delete / enable) — every mutation goes
 * through /api/admin/ads and updates the UI optimistically on success.
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
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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

  const createAd = async () => {
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

    setCreating(true);
    try {
      const response = await fetch(consoleUrl(base, "api/ads"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...parsed.data }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't create the placement"));
        return;
      }
      toast.success("Sponsored placement created");
      setCreateOpen(false);
      setForm(EMPTY_AD);
      // Refresh with the server row — a full reload is the honest path.
      window.location.reload();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setCreating(false);
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
              Shown around the app while the <strong>ads_enabled</strong> +{" "}
              <strong>sponsorships</strong> flags are both on.
            </p>
          </div>
          <Button type="button" onClick={() => setCreateOpen(true)} className="focus-ring">
            <Plus className="size-4" aria-hidden />
            New placement
          </Button>
        </div>

        {ads.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-6" aria-hidden />}
            title="No sponsored placements"
            description="Create one to promote a course, event or resource — it appears in the chosen slot once sponsorships are enabled."
            action={
              <Button type="button" onClick={() => setCreateOpen(true)} className="focus-ring">
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
                        {ad.placement}
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={deleteBusy === ad.id}
                        onClick={() => void deleteAd(ad)}
                        className="focus-ring"
                        aria-label={`Delete ${ad.title}`}
                      >
                        {deleteBusy === ad.id ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="size-4" aria-hidden />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ---------- Create dialog ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New sponsored placement</DialogTitle>
            <DialogDescription>
              Validated with the shared ad schema. It renders once the ads_enabled and sponsorships
              flags are on.
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
                      <SelectItem key={placement} value={placement}>
                        {placement}
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
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void createAd()}
              disabled={creating}
              className="focus-ring"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              {creating ? "Creating…" : "Create placement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
