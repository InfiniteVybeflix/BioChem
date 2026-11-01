"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import {
  FEATURE_ICON_OPTIONS,
  featureIcon,
} from "@/components/console/feature-icons";
import { cn } from "@/lib/utils";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";
import type { FeatureListRow } from "@/app/console-api/features/route";

/**
 * Console CMS — Features. Two sections:
 *
 * 1. Landing-page feature cards — add / edit / reorder / hide the cards
 *    in the public landing page's “Everything your revision needs”
 *    grid, straight from the dashboard (live on next load).
 * 2. Module switches — the platform feature flags that turn whole
 *    modules (AI tutor, community chat, job board…) on or off.
 */

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

const FLAG_LABELS: Record<string, string> = {
  ads_enabled: "Sponsored placements",
  sponsorships: "Sponsorships",
  ai_tutor: "AI tutor",
  question_of_the_day: "Question of the day",
  auto_flashcards: "Auto flashcards",
  community_chat: "Community chat",
  job_board: "Job board",
};

interface FormState {
  icon: string;
  title: string;
  description: string;
  href: string;
}

const EMPTY_FORM: FormState = { icon: "sparkles", title: "", description: "", href: "" };

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

/** Icon cell for a stored feature-icon name (falls back to Sparkles). */
function renderFeatureIcon(name: string, className?: string) {
  const Icon = featureIcon(name);
  return <Icon className={className} aria-hidden />;
}

export function FeaturesManager({
  initialFeatures,
  initialFlags,
}: {
  initialFeatures: FeatureListRow[];
  initialFlags: FeatureFlagRow[];
}) {
  const base = useConsoleBase();
  const [features, setFeatures] = useState<FeatureListRow[]>(initialFeatures);
  const [flags, setFlags] = useState<FeatureFlagRow[]>(initialFlags);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [flagBusy, setFlagBusy] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState<string | null>(null);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (feature: FeatureListRow) => {
    setEditingId(feature.id);
    setForm({
      icon: feature.icon,
      title: feature.title,
      description: feature.description,
      href: feature.href ?? "",
    });
    setDialogOpen(true);
  };

  const saveFeature = async () => {
    const title = form.title.trim();
    const description = form.description.trim();
    if (title.length < 2) {
      toast.error("Give the feature a title");
      return;
    }
    if (description.length < 2) {
      toast.error("Describe what the feature does");
      return;
    }
    setBusy(true);
    try {
      const payload = editingId
        ? {
            action: "update" as const,
            id: editingId,
            icon: form.icon,
            title,
            description,
            href: form.href.trim() || null,
          }
        : {
            action: "create" as const,
            icon: form.icon,
            title,
            description,
            href: form.href.trim() || undefined,
          };
      const response = await fetch(consoleUrl(base, "api/features"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't save the feature"));
        return;
      }
      const data = (await response.json()) as { feature: FeatureListRow };
      setFeatures((prev) =>
        editingId
          ? prev.map((entry) => (entry.id === editingId ? data.feature : entry))
          : [...prev, data.feature],
      );
      toast.success(editingId ? "Feature updated — live on next load" : "Feature card added");
      setDialogOpen(false);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  const deleteFeature = async (feature: FeatureListRow) => {
    setDeleteBusy(feature.id);
    try {
      const response = await fetch(consoleUrl(base, "api/features"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: feature.id }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't delete the feature"));
        return;
      }
      setFeatures((prev) => prev.filter((entry) => entry.id !== feature.id));
      toast.success("Feature card removed");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDeleteBusy(null);
    }
  };

  const toggleFeature = async (feature: FeatureListRow, enabled: boolean) => {
    const previous = features;
    setFeatures((prev) =>
      prev.map((entry) => (entry.id === feature.id ? { ...entry, enabled } : entry)),
    );
    try {
      const response = await fetch(consoleUrl(base, "api/features"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: feature.id, enabled }),
      });
      if (!response.ok) {
        setFeatures(previous);
        toast.error(await readError(response, "Couldn't update the feature"));
        return;
      }
      toast.success(enabled ? "Feature shown on the landing page" : "Feature hidden");
    } catch {
      setFeatures(previous);
      toast.error("Network error — try again");
    }
  };

  const moveFeature = async (feature: FeatureListRow, direction: "up" | "down") => {
    setMoveBusy(feature.id);
    try {
      const response = await fetch(consoleUrl(base, "api/features"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", id: feature.id, direction }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't reorder the features"));
        return;
      }
      const data = (await response.json()) as { features?: FeatureListRow[] };
      if (data.features) setFeatures(data.features);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setMoveBusy(null);
    }
  };

  const toggleFlag = async (flag: FeatureFlagRow, enabled: boolean) => {
    setFlagBusy(flag.key);
    try {
      const response = await fetch(consoleUrl(base, "api/settings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag", key: flag.key, enabled }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't update the switch"));
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

  return (
    <div className="space-y-8">
      {/* ---------- Landing-page feature cards ---------- */}
      <section aria-labelledby="feature-cards-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3
              id="feature-cards-heading"
              className="flex items-center gap-2 font-semibold"
            >
              <Layers className="text-primary size-4" aria-hidden /> Landing-page feature cards
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              The cards in the public landing page&apos;s “Everything your revision needs” grid.
              Add as many as you want, pick an icon, hide or reorder them — changes go live on the
              next page load.
            </p>
          </div>
          <Button type="button" onClick={openCreate} className="focus-ring">
            <Plus className="size-4" aria-hidden />
            Add feature
          </Button>
        </div>

        {features.length === 0 ? (
          <EmptyState
            icon={<Layers className="size-6" aria-hidden />}
            title="No feature cards"
            description="Add the capabilities you want to advertise — each card has an icon, a title and a short description."
            action={
              <Button type="button" onClick={openCreate} className="focus-ring">
                <Plus className="size-4" aria-hidden />
                Add feature
              </Button>
            }
          />
        ) : (
          <div className="glass-card divide-border/60 scrollbar-slim max-h-[30rem] divide-y overflow-y-auto">
            {features.map((feature, index) => (
              <div key={feature.id} className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="bg-primary/12 text-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
                    {renderFeatureIcon(feature.icon, "size-4.5")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{feature.title}</p>
                      {feature.enabled ? null : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          hidden
                        </Badge>
                      )}
                      {feature.href ? (
                        <Badge variant="secondary" className="text-[10px]">
                          links to {feature.href}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm">
                      {feature.description}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="focus-ring size-8"
                    disabled={moveBusy === feature.id || index === 0}
                    onClick={() => void moveFeature(feature, "up")}
                    aria-label={`Move ${feature.title} up`}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="focus-ring size-8"
                    disabled={moveBusy === feature.id || index === features.length - 1}
                    onClick={() => void moveFeature(feature, "down")}
                    aria-label={`Move ${feature.title} down`}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </Button>
                  <Switch
                    checked={feature.enabled}
                    onCheckedChange={(checked) => void toggleFeature(feature, checked)}
                    aria-label={`Show ${feature.title}`}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(feature)}
                    className="focus-ring size-8"
                    aria-label={`Edit ${feature.title}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={deleteBusy === feature.id}
                    onClick={() => void deleteFeature(feature)}
                    className="focus-ring text-destructive size-8"
                    aria-label={`Delete ${feature.title}`}
                  >
                    {deleteBusy === feature.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Module switches ---------- */}
      <section aria-labelledby="feature-flags-heading">
        <h3 id="feature-flags-heading" className="flex items-center gap-2 font-semibold">
          <ToggleLeft className="text-primary size-4" aria-hidden /> Module switches
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Turn whole platform modules on or off for every user, immediately. (Also available on
          the Ads &amp; flags page.)
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

      {/* ---------- Create / edit dialog ---------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit feature card" : "New feature card"}</DialogTitle>
            <DialogDescription>
              Pick an icon, write the card copy, and optionally link it to any page of the app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
                {FEATURE_ICON_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, icon: option.value })}
                    aria-label={option.label}
                    aria-pressed={form.icon === option.value}
                    className={cn(
                      "border-border hover:border-primary/50 focus-ring flex aspect-square items-center justify-center rounded-xl border transition-colors",
                      form.icon === option.value && "border-primary bg-primary/10",
                    )}
                  >
                    {renderFeatureIcon(option.value, "size-4.5")}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feature-title">Title</Label>
              <Input
                id="feature-title"
                value={form.title}
                maxLength={80}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="AI tutor grounded in your notes"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feature-description">Description</Label>
              <Textarea
                id="feature-description"
                rows={3}
                maxLength={400}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="One or two sentences about what students can do with it."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feature-href">Link (optional)</Label>
              <Input
                id="feature-href"
                value={form.href}
                maxLength={200}
                onChange={(event) => setForm({ ...form, href: event.target.value })}
                placeholder="/ai — the card becomes clickable"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveFeature()} disabled={busy} className="focus-ring">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {editingId ? "Save changes" : "Add feature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
