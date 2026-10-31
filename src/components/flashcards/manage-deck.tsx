"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  BookOpen,
  FilePlus2,
  Info,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SetupNotice } from "@/components/common/setup-notice";
import { useUser } from "@/hooks/use-user";
import { zoneLabel } from "@/lib/constants";
import type { ExamZone } from "@/types/domain";

interface OwnCard {
  id: string;
  frontMd: string;
  topicTitle: string | null;
  createdAt: string;
}

interface TopicOption {
  id: string;
  title: string;
  zone: ExamZone;
}

interface NoteOption {
  id: string;
  title: string;
}

const GENERATE_COUNTS = [5, 8, 12] as const;

/** Strip common markdown tokens for a one-line card excerpt. */
function cardExcerpt(markdown: string, max = 90): string {
  const plain = markdown
    .replace(/[#*_`~>]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

/**
 * Manage tab of the flashcards page: your own cards (add / delete) plus
 * AI generation from a published note (gated by the `auto_flashcards` flag).
 */
export function ManageDeck() {
  const router = useRouter();
  const { supabase, userId } = useUser();

  const [cards, setCards] = useState<OwnCard[] | null>(null);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [flagEnabled, setFlagEnabled] = useState<boolean | null>(null);

  // ---------- Add-card dialog ----------
  const [dialogOpen, setDialogOpen] = useState(false);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [topicId, setTopicId] = useState<string>("none");
  const [saving, setSaving] = useState(false);

  // ---------- Generate from note ----------
  const [noteQuery, setNoteQuery] = useState("");
  const [noteResults, setNoteResults] = useState<NoteOption[]>([]);
  const [noteSearching, setNoteSearching] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteOption | null>(null);
  const [generateCount, setGenerateCount] = useState<number>(8);
  const [generating, setGenerating] = useState(false);
  const [gatewayNotice, setGatewayNotice] = useState(false);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCards = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data } = await supabase
      .from("flashcards")
      .select("id, front_md, created_at, topics(title)")
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    setCards(
      (data ?? []).map((row) => ({
        id: row.id,
        frontMd: row.front_md,
        topicTitle: row.topics?.title ?? null,
        createdAt: row.created_at,
      })),
    );
  }, [supabase, userId]);

  // Own cards + topics + feature flag.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    void (async () => {
      await loadCards();
      const [{ data: topicRows }, { data: flag }] = await Promise.all([
        supabase.from("topics").select("id, title, zone").order("zone").order("order_index"),
        supabase.from("feature_flags").select("enabled").eq("key", "auto_flashcards").maybeSingle(),
      ]);
      if (cancelled) return;
      setTopics(topicRows ?? []);
      // A missing flag row defaults to enabled (mirrors the server-side guard).
      setFlagEnabled(!flag || flag.enabled !== false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, loadCards]);

  // Debounced note search.
  useEffect(() => {
    if (!supabase) return;
    const query = noteQuery.trim();
    if (query.length < 2 || selectedNote) {
      setNoteResults([]);
      setNoteSearching(false);
      return;
    }
    setDropdownDismissed(false);
    setNoteSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void supabase
        .from("notes")
        .select("id, title")
        .eq("status", "published")
        .ilike("title", `%${query}%`)
        .order("title")
        .limit(8)
        .then(({ data }) => {
          setNoteResults(data ?? []);
          setNoteSearching(false);
        });
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [supabase, noteQuery, selectedNote]);

  const addCard = async () => {
    if (!supabase || !userId) return;
    if (front.trim().length < 2 || back.trim().length < 2) {
      toast.error("Give the card a question and an answer first");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("flashcards").insert({
      front_md: front.trim(),
      back_md: back.trim(),
      topic_id: topicId === "none" ? null : topicId,
      source: "manual",
      visibility: "private",
      status: "published",
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      toast.error("Could not add this card");
      return;
    }
    toast.success("Card added to your deck");
    setDialogOpen(false);
    setFront("");
    setBack("");
    setTopicId("none");
    await loadCards();
    router.refresh();
  };

  const deleteCard = async (id: string) => {
    try {
      const res = await fetch(`/api/flashcards/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        toast.error((body as { error?: string }).error ?? "Could not delete this card");
        return;
      }
      setCards((prev) => (prev ? prev.filter((card) => card.id !== id) : prev));
      toast.success("Card deleted");
      router.refresh();
    } catch {
      toast.error("Network error — could not delete this card");
    }
  };

  const generate = async () => {
    if (!selectedNote || generating) return;
    setGenerating(true);
    setGatewayNotice(false);
    try {
      const res = await fetch("/api/ai/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: selectedNote.id, count: generateCount }),
      });
      const body: unknown = await res.json().catch(() => ({}));

      if (res.status === 202) {
        toast.info("Gateway unreachable — generation queued");
        return;
      }
      if (res.status === 403) {
        toast.error((body as { error?: string }).error ?? "AI flashcard generation is disabled");
        return;
      }
      if (res.status === 503) {
        setGatewayNotice(true); // gateway unconfigured — inline setup steps
        return;
      }
      if (!res.ok) {
        toast.error((body as { error?: string }).error ?? "Generation failed — try again later");
        return;
      }

      const created = (body as { flashcards?: number }).flashcards ?? 0;
      toast.success(
        created === 1
          ? "1 flashcard generated"
          : `${created} flashcards generated from “${selectedNote.title}”`,
      );
      setSelectedNote(null);
      setNoteQuery("");
      await loadCards();
      router.refresh();
    } catch {
      toast.error("Network error — generation failed");
    } finally {
      setGenerating(false);
    }
  };

  if (!supabase) {
    return <SetupNotice missing="app" compact />;
  }

  const dropdownOpen = !selectedNote && !dropdownDismissed && noteQuery.trim().length >= 2;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr,380px]">
      {/* ---------- Your cards ---------- */}
      <section aria-labelledby="your-cards-heading" className="glass-card p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 id="your-cards-heading" className="font-heading text-lg font-semibold">
            Your cards
          </h2>
          {cards ? (
            <Badge variant="secondary">
              {cards.length} card{cards.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>

        {cards === null ? (
          <div className="mt-4 space-y-3" aria-busy="true" aria-label="Loading your cards">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-4/5" />
          </div>
        ) : cards.length === 0 ? (
          <p className="border-border/70 text-muted-foreground mt-4 rounded-lg border border-dashed p-6 text-center text-sm">
            No cards of your own yet — add one on the right, or generate a set from a note.
          </p>
        ) : (
          <ul className="scrollbar-slim mt-4 max-h-96 divide-y overflow-y-auto">
            {cards.map((card) => (
              <li key={card.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm leading-6">{cardExcerpt(card.frontMd)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {card.topicTitle ? (
                      <Badge variant="outline">{card.topicTitle}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        No topic
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs">
                      added {formatDistanceToNow(parseISO(card.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete card: ${cardExcerpt(card.frontMd, 40)}`}
                      className="text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this card?</AlertDialogTitle>
                      <AlertDialogDescription>
                        “{cardExcerpt(card.frontMd, 120)}” and its review history will be removed
                        from your deck. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep it</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void deleteCard(card.id)}>
                        Delete card
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Add + generate ---------- */}
      <div className="space-y-6">
        <section aria-labelledby="add-card-heading" className="glass-card p-4 sm:p-6">
          <h2 id="add-card-heading" className="font-heading text-lg font-semibold">
            Add a card
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Write your own question/answer pair — markdown and LaTeX are supported.
          </p>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="mt-4 w-full">
                <Plus className="size-4" aria-hidden />
                New card
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>New flashcard</DialogTitle>
                <DialogDescription>
                  Private to you — it joins your review queue immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="card-front">Front (question)</Label>
                  <Textarea
                    id="card-front"
                    value={front}
                    onChange={(event) => setFront(event.target.value)}
                    placeholder="e.g. Which enzyme commits glycolysis to the pathway?"
                    className="min-h-20"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-back">Back (answer)</Label>
                  <Textarea
                    id="card-back"
                    value={back}
                    onChange={(event) => setBack(event.target.value)}
                    placeholder="e.g. Phosphofructokinase-1 (PFK-1) — fructose-6-phosphate → fructose-1,6-bisphosphate"
                    className="min-h-24"
                  />
                  <p className="text-muted-foreground text-xs">
                    Markdown formatting and $LaTeX$ both render on the card.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="card-topic">Topic</Label>
                  <Select value={topicId} onValueChange={setTopicId}>
                    <SelectTrigger id="card-topic" className="w-full" aria-label="Topic">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No topic</SelectItem>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {zoneLabel(topic.zone)} · {topic.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void addCard()}
                  disabled={saving || front.trim().length < 2 || back.trim().length < 2}
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <FilePlus2 className="size-4" aria-hidden />
                  )}
                  Add card
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        {/* ---------- Generate from note ---------- */}
        <section aria-labelledby="generate-heading" className="glass-card p-4 sm:p-6">
          <h2 id="generate-heading" className="font-heading text-lg font-semibold">
            Generate from note
          </h2>

          {flagEnabled === null ? (
            <Skeleton className="mt-4 h-24 w-full" aria-label="Loading generator" />
          ) : flagEnabled === false ? (
            <Alert className="mt-4">
              <Info className="size-4" aria-hidden />
              <AlertTitle>AI generation is turned off</AlertTitle>
              <AlertDescription>
                Automatic flashcard generation is temporarily disabled by the administrators. You
                can still add cards by hand above.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-muted-foreground mt-1 text-sm">
                Pick a published note and let the AI write SM-2-ready cards from it.
              </p>

              {gatewayNotice ? <SetupNotice missing="gateway" compact /> : null}

              {selectedNote ? (
                <div
                  className="bg-card/60 mt-4 flex items-center justify-between gap-3 rounded-lg border p-3"
                  role="status"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <BookOpen className="text-primary size-4 shrink-0" aria-hidden />
                    <span className="truncate text-sm font-medium">{selectedNote.title}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Choose a different note"
                    onClick={() => {
                      setSelectedNote(null);
                      setNoteQuery("");
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : (
                <div className="relative mt-4">
                  <Search
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={noteQuery}
                    onChange={(event) => setNoteQuery(event.target.value)}
                    placeholder="Search published notes…"
                    className="pl-9"
                    aria-label="Search published notes"
                    autoComplete="off"
                  />
                  {dropdownOpen ? (
                    <>
                      <button
                        type="button"
                        aria-label="Close search results"
                        className="fixed inset-0 z-10 cursor-default"
                        onClick={() => setDropdownDismissed(true)}
                      />
                      <div className="bg-popover absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border shadow-lg">
                        {noteSearching ? (
                          <p className="text-muted-foreground px-3 py-2.5 text-sm">Searching…</p>
                        ) : noteResults.length === 0 ? (
                          <p className="text-muted-foreground px-3 py-2.5 text-sm">
                            No published notes match.
                          </p>
                        ) : (
                          <ul className="scrollbar-slim max-h-60 overflow-y-auto">
                            {noteResults.map((note) => (
                              <li key={note.id}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedNote(note)}
                                  className="hover:bg-accent/60 flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors"
                                >
                                  <BookOpen
                                    className="text-muted-foreground size-4 shrink-0"
                                    aria-hidden
                                  />
                                  <span className="truncate">{note.title}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="generate-count">Cards to generate</Label>
                <Select
                  value={String(generateCount)}
                  onValueChange={(value) => {
                    const next = Number(value);
                    if (GENERATE_COUNTS.some((c) => c === next)) setGenerateCount(next);
                  }}
                >
                  <SelectTrigger
                    id="generate-count"
                    className="w-full"
                    aria-label="Cards to generate"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERATE_COUNTS.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count} cards
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="mt-4 w-full"
                onClick={() => void generate()}
                disabled={!selectedNote || generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {generating ? "Generating…" : "Generate flashcards"}
              </Button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
