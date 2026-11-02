"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Link2,
  Loader2,
  Newspaper,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/common/ui-bits";
import { Markdown } from "@/components/markdown/markdown";
import { cn } from "@/lib/utils";
import { consoleUrl, useConsoleBase } from "@/lib/admin/console-context";
import type { NewsArticleRow } from "@/app/console-api/news/route";
import type { NewsCategory, NewsSettings, NewsSource } from "@/types/domain";

/**
 * Console — News & live updates. Three halves:
 *
 * 1. Live settings — master switch, landing/app visibility, the AI
 *    auto-search loop (interval + auto-publish + interest keywords)
 *    and the RSS sources it fetches from the internet.
 * 2. "Fetch now" runs the pipeline on demand and every found update
 *    lands in a review panel — publish or dismiss each one.
 * 3. The article desk — hand-write, AI-draft from pasted text, or
 *    load a URL and turn the page into an article after previewing it.
 */

const CATEGORY_LABELS: Record<NewsCategory, string> = {
  research: "Research",
  exams: "Exams",
  campus: "Campus",
  jobs: "Jobs",
  general: "General",
};

const CATEGORY_BADGES: Record<NewsCategory, string> = {
  research: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  exams: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  campus: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  jobs: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  general: "border-border bg-muted text-muted-foreground",
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

interface FormState {
  title: string;
  summary: string;
  content_md: string;
  category: NewsCategory;
  source_url: string;
  source_label: string;
  image_url: string;
  status: "draft" | "published";
  pinned: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  summary: "",
  content_md: "",
  category: "research",
  source_url: "",
  source_label: "",
  image_url: "",
  status: "published",
  pinned: false,
};

/** What "Fetch now" found this run — one row per created article. */
interface FetchedItem {
  id: string;
  title: string;
  summary: string;
  source_url: string | null;
  source_label: string | null;
  status: "draft" | "published";
  category: NewsCategory;
}

/** What a loaded URL looks like before it becomes an article. */
interface UrlPreview {
  url: string;
  ok: boolean;
  error?: string;
  title?: string;
  site_label?: string;
  description?: string;
  text_preview?: string;
  word_count?: number;
  image_url?: string | null;
}

interface RefreshSummary {
  added: number;
  published: number;
  skipped: number;
  sourcesOk: number;
  sourcesFailed: number;
  failedSources: string[];
  aiDigested: boolean;
  items: FetchedItem[];
  error?: string;
}

export function NewsManager({
  initialSettings,
  initialArticles,
  aiConfigured,
}: {
  initialSettings: NewsSettings;
  initialArticles: NewsArticleRow[];
  aiConfigured: boolean;
}) {
  const base = useConsoleBase();
  const [settings, setSettings] = useState<NewsSettings>(initialSettings);
  const [articles, setArticles] = useState<NewsArticleRow[]>(initialArticles);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fetched, setFetched] = useState<FetchedItem[]>([]);
  const [fetchedNote, setFetchedNote] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [rawMaterial, setRawMaterial] = useState("");
  const [deleteBusy, setDeleteBusy] = useState<string | null>(null);
  const [newSource, setNewSource] = useState<{ label: string; url: string }>({
    label: "",
    url: "",
  });
  const [linkInput, setLinkInput] = useState("");
  const [ingesting, setIngesting] = useState(false);
  const [previews, setPreviews] = useState<UrlPreview[]>([]);
  const [draftingUrl, setDraftingUrl] = useState<string | null>(null);
  const [publishBusy, setPublishBusy] = useState<string | null>(null);

  const patchSettings = async (patch: Partial<NewsSettings>): Promise<boolean> => {
    const previous = settings;
    setSettings({ ...settings, ...patch });
    setSettingsBusy(true);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", patch }),
      });
      if (!response.ok) {
        setSettings(previous);
        toast.error(await readError(response, "Couldn't save the news settings"));
        return false;
      }
      return true;
    } catch {
      setSettings(previous);
      toast.error("Network error — try again");
      return false;
    } finally {
      setSettingsBusy(false);
    }
  };

  const reloadList = async () => {
    const listResponse = await fetch(consoleUrl(base, "api/news"), { cache: "no-store" });
    if (listResponse.ok) {
      const list = (await listResponse.json()) as {
        settings: NewsSettings;
        articles: NewsArticleRow[];
      };
      setArticles(list.articles);
      setSettings(list.settings);
    }
  };

  const runRefresh = async () => {
    setRefreshing(true);
    setFetchedNote(null);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "The news fetch failed"));
        return;
      }
      const data = (await response.json()) as { ran: boolean; result: RefreshSummary | null };
      if (!data.result) {
        toast.info("No sources enabled — add at least one RSS source below");
        return;
      }
      const r = data.result;
      setFetched(r.items);
      const parts: string[] = [];
      if (r.added > 0) {
        parts.push(
          `${r.added} new update${r.added === 1 ? "" : "s"}${
            r.published ? ` · ${r.published} published` : " · saved as drafts"
          }${r.aiDigested ? " · AI-digested" : ""}`,
        );
      } else if (r.error) {
        parts.push(`Nothing added — ${r.error}`);
      } else {
        parts.push(`Nothing new — ${r.skipped} item${r.skipped === 1 ? "" : "s"} already known`);
      }
      if (r.sourcesFailed > 0) {
        parts.push(
          `${r.sourcesFailed} source${r.sourcesFailed === 1 ? "" : "s"} unreachable${
            r.failedSources.length ? `: ${r.failedSources.join(", ")}` : ""
          }`,
        );
      }
      setFetchedNote(parts.join(" · "));
      if (r.added > 0) {
        toast.success(`${r.added} update${r.added === 1 ? "" : "s"} ready — review them below`);
      } else {
        toast.info(parts[0]);
      }
      await reloadList();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setRefreshing(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRawMaterial("");
    setDialogOpen(true);
  };

  const openEdit = (article: NewsArticleRow) => {
    setEditingId(article.id);
    setForm({
      title: article.title,
      summary: article.summary,
      content_md: article.content_md,
      category: article.category,
      source_url: article.source_url ?? "",
      source_label: article.source_label ?? "",
      image_url: article.image_url ?? "",
      status: article.status === "published" ? "published" : "draft",
      pinned: article.pinned,
    });
    setRawMaterial("");
    setDialogOpen(true);
  };

  const draftWithAi = async (material?: string) => {
    const text = (material ?? rawMaterial).trim();
    if (text.length < 20) {
      toast.error("Paste the article text or a link first");
      return;
    }
    setDrafting(true);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "draft", text }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "The AI draft failed"));
        return;
      }
      const data = (await response.json()) as {
        draft: {
          title: string;
          summary: string;
          content_md: string;
          category: NewsCategory;
          source_url: string | null;
          source_label: string;
          image_url: string | null;
        };
      };
      setForm((prev) => ({
        ...prev,
        title: data.draft.title,
        summary: data.draft.summary,
        content_md: data.draft.content_md,
        category: data.draft.category,
        source_url: data.draft.source_url ?? prev.source_url,
        source_label: data.draft.source_label || prev.source_label,
        image_url: data.draft.image_url ?? prev.image_url,
      }));
      toast.success("AI draft ready — review and adjust below");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDrafting(false);
    }
  };

  /** Load the pasted URLs and show what each page is about. */
  const loadLinks = async () => {
    const urls = linkInput
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => /^https?:\/\//i.test(line))
      .slice(0, 5);
    if (urls.length === 0) {
      toast.error("Paste at least one link starting with https://");
      return;
    }
    setIngesting(true);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ingest", urls }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't load those pages"));
        return;
      }
      const data = (await response.json()) as { previews: UrlPreview[] };
      setPreviews(data.previews);
      const okCount = data.previews.filter((preview) => preview.ok).length;
      if (okCount === 0) {
        toast.error("None of those pages could be loaded");
      } else {
        toast.success(
          `${okCount} page${okCount === 1 ? "" : "s"} loaded — preview them below, then draft with AI`,
        );
      }
    } catch {
      toast.error("Network error — try again");
    } finally {
      setIngesting(false);
    }
  };

  /** Turn a loaded page into an AI draft and open the editor. */
  const draftFromPreview = async (preview: UrlPreview) => {
    if (!aiConfigured) {
      toast.error("The AI gateway is not configured on this deployment");
      return;
    }
    setDraftingUrl(preview.url);
    setDialogOpen(true);
    setEditingId(null);
    setForm((prev) => ({
      ...EMPTY_FORM,
      category: prev.category,
      source_url: preview.url,
      source_label: preview.site_label ?? "",
      image_url: preview.image_url ?? "",
      title: preview.title && preview.title.length >= 4 ? preview.title : "",
      summary: preview.description ?? "",
    }));
    setRawMaterial(preview.url);
    try {
      await draftWithAi(preview.url);
    } finally {
      setDraftingUrl(null);
    }
  };

  const saveArticle = async () => {
    const title = form.title.trim();
    if (title.length < 4) {
      toast.error("Give the article a headline");
      return;
    }
    setBusy(true);
    try {
      const payload = editingId
        ? {
            action: "update" as const,
            id: editingId,
            title,
            summary: form.summary.trim(),
            content_md: form.content_md,
            category: form.category,
            source_url: form.source_url.trim() || null,
            source_label: form.source_label.trim() || null,
            image_url: form.image_url.trim() || null,
            status: form.status,
            pinned: form.pinned,
          }
        : {
            action: "create" as const,
            title,
            summary: form.summary.trim(),
            content_md: form.content_md,
            category: form.category,
            source_url: form.source_url.trim() || null,
            source_label: form.source_label.trim() || null,
            image_url: form.image_url.trim() || null,
            status: form.status,
            pinned: form.pinned,
          };
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't save the article"));
        return;
      }
      const data = (await response.json()) as { article: NewsArticleRow };
      setArticles((prev) =>
        editingId
          ? prev.map((entry) => (entry.id === editingId ? data.article : entry))
          : [data.article, ...prev],
      );
      toast.success(
        editingId
          ? "Article updated"
          : data.article.status === "published"
            ? "Article published — live for students"
            : "Article saved as a draft",
      );
      setDialogOpen(false);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: "draft" | "published") => {
    setPublishBusy(id);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, status }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't update the article"));
        return false;
      }
      const data = (await response.json()) as { article: NewsArticleRow };
      setArticles((prev) => prev.map((entry) => (entry.id === id ? data.article : entry)));
      setFetched((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, status } : entry)),
      );
      toast.success(status === "published" ? "Published — live for students" : "Moved to drafts");
      return true;
    } catch {
      toast.error("Network error — try again");
      return false;
    } finally {
      setPublishBusy(null);
    }
  };

  const togglePublish = async (article: NewsArticleRow) => {
    const status = article.status === "published" ? "draft" : "published";
    await setStatus(article.id, status);
  };

  const togglePin = async (article: NewsArticleRow) => {
    const pinned = !article.pinned;
    const previous = articles;
    setArticles((prev) =>
      prev.map((entry) => (entry.id === article.id ? { ...entry, pinned } : entry)),
    );
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id: article.id, pinned }),
      });
      if (!response.ok) {
        setArticles(previous);
        toast.error(await readError(response, "Couldn't update the article"));
        return;
      }
    } catch {
      setArticles(previous);
      toast.error("Network error — try again");
    }
  };

  const deleteArticle = async (article: NewsArticleRow) => {
    setDeleteBusy(article.id);
    try {
      const response = await fetch(consoleUrl(base, "api/news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: article.id }),
      });
      if (!response.ok) {
        toast.error(await readError(response, "Couldn't delete the article"));
        return;
      }
      setArticles((prev) => prev.filter((entry) => entry.id !== article.id));
      setFetched((prev) => prev.filter((entry) => entry.id !== article.id));
      toast.success("Article deleted");
    } catch {
      toast.error("Network error — try again");
    } finally {
      setDeleteBusy(null);
    }
  };

  const addSource = async () => {
    const url = newSource.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Enter a valid source URL (https://…)");
      return;
    }
    const source: NewsSource = {
      id: `src-${Date.now().toString(36)}`,
      label: newSource.label.trim() || new URL(url).hostname,
      url,
      enabled: true,
    };
    const saved = await patchSettings({ sources: [...settings.sources, source] });
    if (saved) {
      setNewSource({ label: "", url: "" });
      toast.success("Source added — it joins the next fetch");
    }
  };

  const removeSource = async (id: string) => {
    await patchSettings({ sources: settings.sources.filter((source) => source.id !== id) });
  };

  const SwitchRow = ({
    label,
    hint,
    checked,
    onChange,
  }: {
    label: string;
    hint: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) => (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={settingsBusy} />
    </div>
  );

  return (
    <div className="space-y-8">
      {/* ---------- Live updates settings ---------- */}
      <section aria-labelledby="news-settings-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="news-settings-heading" className="flex items-center gap-2 font-semibold">
              <Globe className="text-primary size-4" aria-hidden /> Live updates from the internet
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              The AI watches real science news feeds (RSS) for biochemistry-relevant stories and
              rewrites them for your students. Auto mode fetches on an interval — or hit{" "}
              <em>Fetch now</em> any time.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void runRefresh()}
            disabled={refreshing}
            className="focus-ring"
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            {refreshing ? "Fetching…" : "Fetch now"}
          </Button>
        </div>

        {fetchedNote ? (
          <p className="text-muted-foreground mt-3 text-xs">This fetch: {fetchedNote}</p>
        ) : settings.last_run_result ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Last run: {settings.last_run_result}
            {settings.last_run_at
              ? ` · ${new Date(settings.last_run_at).toLocaleString("en-KE")}`
              : ""}
          </p>
        ) : null}

        {!settings.enabled ? (
          <div className="border-amber-500/40 bg-amber-500/10 mt-4 flex items-start gap-3 rounded-lg border p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                News is switched off — students can&apos;t see any articles
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Published articles only appear on the landing page, the /news page and the
                dashboard while the master switch is on.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="focus-ring shrink-0"
              disabled={settingsBusy}
              onClick={() => void patchSettings({ enabled: true })}
            >
              Turn on now
            </Button>
          </div>
        ) : null}

        <div className="glass-card divide-border/60 mt-4 divide-y">
          <SwitchRow
            label="News module"
            hint="Master switch — hides the landing news section, the /news page and the dashboard strip when off."
            checked={settings.enabled}
            onChange={(enabled) => void patchSettings({ enabled })}
          />
          <SwitchRow
            label="Show on the landing page"
            hint="The public home page gets a news section with the latest updates."
            checked={settings.show_on_landing}
            onChange={(show_on_landing) => void patchSettings({ show_on_landing })}
          />
          <SwitchRow
            label="Show inside the app"
            hint="Signed-in students get the /news page and a dashboard strip."
            checked={settings.show_in_app}
            onChange={(show_in_app) => void patchSettings({ show_in_app })}
          />
          <SwitchRow
            label="AI auto search"
            hint="Automatically fetch the sources below and write fresh updates — no manual work."
            checked={settings.auto_search}
            onChange={(auto_search) => void patchSettings({ auto_search })}
          />
          <SwitchRow
            label="Auto publish"
            hint="On: fetched updates go live immediately. Off: they wait as drafts for your review."
            checked={settings.auto_publish}
            onChange={(auto_publish) => void patchSettings({ auto_publish })}
          />

          <div className="flex flex-wrap items-end gap-3 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="news-interval">Auto-search interval</Label>
              <Select
                value={String(settings.interval_hours)}
                onValueChange={(value) =>
                  void patchSettings({ interval_hours: Number(value) as 3 | 6 | 12 | 24 })
                }
              >
                <SelectTrigger id="news-interval" className="w-40" aria-label="Auto-search interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Every 3 hours</SelectItem>
                  <SelectItem value="6">Every 6 hours</SelectItem>
                  <SelectItem value="12">Every 12 hours</SelectItem>
                  <SelectItem value="24">Every 24 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="news-interests">Interest keywords</Label>
              <Input
                id="news-interests"
                value={settings.interests}
                maxLength={400}
                placeholder="biochemistry, enzymes, metabolism, KEMRI, malaria…"
                onChange={(event) => setSettings({ ...settings, interests: event.target.value })}
                onBlur={() => void patchSettings({ interests: settings.interests })}
              />
              <p className="text-muted-foreground text-xs">
                Comma-separated — only stories matching at least one keyword are kept. Empty keeps
                everything.
              </p>
            </div>
          </div>
        </div>

        {!aiConfigured && settings.auto_search ? (
          <p className="text-amber-600 dark:text-amber-400 mt-3 text-xs">
            The AI gateway isn&apos;t configured — auto mode will store raw headlines instead of
            student-friendly articles.
          </p>
        ) : null}

        {/* Sources */}
        <div className="glass-card mt-4 p-4">
          <p className="text-sm font-semibold">News sources (RSS / Atom)</p>
          <div className="divide-border/60 mt-2 divide-y">
            {settings.sources.map((source) => (
              <div key={source.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{source.label}</p>
                  <p className="text-muted-foreground truncate font-mono text-xs">{source.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(enabled) =>
                      void patchSettings({
                        sources: settings.sources.map((entry) =>
                          entry.id === source.id ? { ...entry, enabled } : entry,
                        ),
                      })
                    }
                    aria-label={`Toggle ${source.label}`}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-destructive size-8"
                    onClick={() => void removeSource(source.id)}
                    aria-label={`Remove ${source.label}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1 space-y-1">
              <Label htmlFor="source-label">Label</Label>
              <Input
                id="source-label"
                value={newSource.label}
                placeholder="Nature · Biochemistry"
                maxLength={120}
                onChange={(event) => setNewSource({ ...newSource, label: event.target.value })}
              />
            </div>
            <div className="min-w-56 flex-[2] space-y-1">
              <Label htmlFor="source-url">RSS / Atom URL</Label>
              <Input
                id="source-url"
                value={newSource.url}
                placeholder="https://example.com/rss"
                onChange={(event) => setNewSource({ ...newSource, url: event.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              onClick={() => void addSource()}
            >
              <Plus className="size-4" aria-hidden /> Add source
            </Button>
          </div>
        </div>
      </section>

      {/* ---------- Fetched updates review ---------- */}
      {fetched.length > 0 ? (
        <section aria-labelledby="news-fetched-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 id="news-fetched-heading" className="flex items-center gap-2 font-semibold">
                <Sparkles className="text-primary size-4" aria-hidden /> Fetched updates — review
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                What the last fetch found. Publish the ones you want students to see, or dismiss
                them — everything also stays in the article list below.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="focus-ring"
              onClick={() => setFetched([])}
            >
              <X className="size-4" aria-hidden /> Hide panel
            </Button>
          </div>
          <div className="glass-card divide-border/60 scrollbar-slim mt-4 max-h-[26rem] divide-y overflow-y-auto">
            {fetched.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{item.title}</p>
                    <Badge variant="outline" className={cn("text-[10px]", CATEGORY_BADGES[item.category])}>
                      {CATEGORY_LABELS[item.category]}
                    </Badge>
                    {item.status === "published" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">
                        live
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        draft
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {item.summary || "No summary"}
                  </p>
                  {item.source_url ? (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      {item.source_label || item.source_url}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.status === "published" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="focus-ring"
                      disabled={publishBusy === item.id}
                      onClick={() => void setStatus(item.id, "draft")}
                    >
                      Unpublish
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="focus-ring"
                      disabled={publishBusy === item.id}
                      onClick={() => void setStatus(item.id, "published")}
                    >
                      {publishBusy === item.id ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <CheckCircle2 className="size-4" aria-hidden />
                      )}
                      Publish
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="focus-ring size-8"
                    onClick={() => {
                      const row = articles.find((entry) => entry.id === item.id);
                      if (row) openEdit(row);
                    }}
                    aria-label={`Edit ${item.title}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-foreground size-8"
                    onClick={() => setFetched((prev) => prev.filter((entry) => entry.id !== item.id))}
                    aria-label={`Dismiss ${item.title}`}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ---------- Load from the web (URLs) ---------- */}
      <section aria-labelledby="news-links-heading">
        <h3 id="news-links-heading" className="flex items-center gap-2 font-semibold">
          <Link2 className="text-primary size-4" aria-hidden /> Add from the web (URLs)
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Paste one or more article links (one per line, up to 5). BioChem loads each page and
          shows what it&apos;s about — then the AI turns it into a student article you can edit and
          publish.
        </p>
        <div className="glass-card mt-3 space-y-3 p-4">
          <Textarea
            id="news-links-input"
            rows={3}
            value={linkInput}
            placeholder={"https://www.sciencedaily.com/releases/…\nhttps://www.nature.com/articles/…"}
            onChange={(event) => setLinkInput(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="focus-ring"
              disabled={ingesting}
              onClick={() => void loadLinks()}
            >
              {ingesting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Globe className="size-4" aria-hidden />
              )}
              {ingesting ? "Loading pages…" : "Load pages"}
            </Button>
            {previews.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="focus-ring"
                onClick={() => {
                  setPreviews([]);
                  setLinkInput("");
                }}
              >
                <X className="size-4" aria-hidden /> Clear
              </Button>
            ) : null}
          </div>

          {previews.length > 0 ? (
            <div className="space-y-3">
              {previews.map((preview) => (
                <div key={preview.url} className="border-border/60 rounded-lg border p-3">
                  {preview.ok ? (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{preview.title}</p>
                          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                            {preview.site_label} · {preview.word_count} words
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="focus-ring shrink-0"
                          disabled={draftingUrl === preview.url || !aiConfigured}
                          onClick={() => void draftFromPreview(preview)}
                        >
                          {draftingUrl === preview.url ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Sparkles className="size-4" aria-hidden />
                          )}
                          {draftingUrl === preview.url ? "Drafting…" : "Draft with AI"}
                        </Button>
                      </div>
                      {preview.description ? (
                        <p className="text-muted-foreground mt-2 text-sm">{preview.description}</p>
                      ) : null}
                      {preview.text_preview ? (
                        <p className="text-muted-foreground/80 border-border/60 mt-2 line-clamp-4 border-l-2 pl-3 text-xs italic">
                          {preview.text_preview}…
                        </p>
                      ) : null}
                      <a
                        href={preview.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
                      >
                        Open the original page
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </>
                  ) : (
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Couldn&apos;t load this page</p>
                        <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                          {preview.url}
                        </p>
                        <p className="text-muted-foreground mt-1 text-xs">{preview.error}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* ---------- Article desk ---------- */}
      <section aria-labelledby="news-articles-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 id="news-articles-heading" className="flex items-center gap-2 font-semibold">
              <Newspaper className="text-primary size-4" aria-hidden /> Articles
            </h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Everything the pipeline fetched plus your hand-written notices. Published articles
              appear on the landing page, the /news page and the dashboard strip.
            </p>
          </div>
          <Button type="button" onClick={openCreate} className="focus-ring">
            <Plus className="size-4" aria-hidden /> Write article
          </Button>
        </div>

        {articles.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Newspaper className="size-6" aria-hidden />}
              title="No articles yet"
              description="Hit “Fetch now” to pull the latest biochemistry news from the internet, load a URL below, or write your own campus notice."
              action={
                <Button type="button" onClick={openCreate} className="focus-ring">
                  <Plus className="size-4" aria-hidden /> Write article
                </Button>
              }
            />
          </div>
        ) : (
          <div className="glass-card divide-border/60 scrollbar-slim mt-4 max-h-[34rem] divide-y overflow-y-auto">
            {articles.map((article) => (
              <div key={article.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{article.title}</p>
                    <Badge variant="outline" className={cn("text-[10px]", CATEGORY_BADGES[article.category])}>
                      {CATEGORY_LABELS[article.category]}
                    </Badge>
                    {article.status === "published" ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700 text-[10px] dark:text-emerald-300">
                        live
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                        draft
                      </Badge>
                    )}
                    {article.pinned ? <Pin className="text-primary size-3" aria-hidden /> : null}
                    {article.auto ? (
                      <Badge variant="secondary" className="text-[10px]">
                        auto
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                    {article.summary || article.content_md.slice(0, 160)}
                  </p>
                  {article.source_url ? (
                    <a
                      href={article.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      {article.source_label || article.source_url}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void togglePublish(article)}
                    className="focus-ring"
                  >
                    {article.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="focus-ring size-8"
                    onClick={() => void togglePin(article)}
                    aria-label={article.pinned ? `Unpin ${article.title}` : `Pin ${article.title}`}
                  >
                    <Pin className={cn("size-4", article.pinned && "text-primary")} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(article)}
                    className="focus-ring size-8"
                    aria-label={`Edit ${article.title}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={deleteBusy === article.id}
                    onClick={() => void deleteArticle(article)}
                    className="text-destructive size-8"
                    aria-label={`Delete ${article.title}`}
                  >
                    {deleteBusy === article.id ? (
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

      {/* ---------- Create / edit dialog ---------- */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingId(null);
        }}
      >
        <DialogContent className="scrollbar-slim max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit article" : "Write article"}</DialogTitle>
            <DialogDescription>
              Paste a link or raw text and let the AI draft it — or write the notice yourself.
            </DialogDescription>
          </DialogHeader>

          <div className="glass-card space-y-2 p-3">
            <Label htmlFor="news-raw-material">Source material (optional)</Label>
            <Textarea
              id="news-raw-material"
              rows={3}
              value={rawMaterial}
              placeholder="https://…  or paste the full article text / announcement"
              onChange={(event) => setRawMaterial(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="focus-ring"
              disabled={drafting || !aiConfigured}
              onClick={() => void draftWithAi()}
            >
              {drafting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {drafting ? "Drafting…" : "Draft with AI"}
            </Button>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="news-title">Headline</Label>
              <Input
                id="news-title"
                value={form.title}
                maxLength={300}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Scientists map a new enzyme switch in malaria parasites"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="news-category">Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(value) =>
                    setForm({ ...form, category: value as NewsCategory })
                  }
                >
                  <SelectTrigger id="news-category" aria-label="Choose the category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="news-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(value) =>
                    setForm({ ...form, status: value as "draft" | "published" })
                  }
                >
                  <SelectTrigger id="news-status" aria-label="Choose the status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published — live for students</SelectItem>
                    <SelectItem value="draft">Draft — only you see it</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-summary">Summary (the one-line hook)</Label>
              <Input
                id="news-summary"
                value={form.summary}
                maxLength={400}
                onChange={(event) => setForm({ ...form, summary: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-content">Article body (Markdown)</Label>
              <Textarea
                id="news-content"
                rows={8}
                value={form.content_md}
                onChange={(event) => setForm({ ...form, content_md: event.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="news-source-url">Source URL (optional)</Label>
                <Input
                  id="news-source-url"
                  value={form.source_url}
                  onChange={(event) => setForm({ ...form, source_url: event.target.value })}
                  placeholder="https://…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="news-source-label">Source label</Label>
                <Input
                  id="news-source-label"
                  value={form.source_label}
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, source_label: event.target.value })}
                  placeholder="ScienceDaily"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="news-image-url">Image URL (optional)</Label>
              <Input
                id="news-image-url"
                value={form.image_url}
                onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                placeholder="https://…/cover.jpg"
              />
            </div>
            {form.content_md.trim() ? (
              <div className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium">Preview</p>
                <div className="glass-card max-h-56 overflow-y-auto p-3 text-sm">
                  <Markdown>{form.content_md}</Markdown>
                </div>
              </div>
            ) : null}
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
            <Button type="button" onClick={() => void saveArticle()} disabled={busy} className="focus-ring">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {editingId ? "Save changes" : form.status === "published" ? "Publish" : "Save draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
