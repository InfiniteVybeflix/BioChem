"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Atom,
  BookOpen,
  BrainCircuit,
  Calendar,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  Flame,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  MessagesSquare,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  Users,
  SunMedium,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";

interface SearchResults {
  notes: { id: string; title: string; slug: string }[];
  questions: { id: string; stem_md: string }[];
  discussions: { id: string; title: string }[];
}

const EMPTY_SEARCH: SearchResults = { notes: [], questions: [], discussions: [] };

/** Global ⌘K command palette: navigation, actions and full-text search. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH);
  const { role, signOut, can } = useUser();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const openSearch = () => setOpen(true);
    window.addEventListener("biochem:open-search", openSearch);
    return () => window.removeEventListener("biochem:open-search", openSearch);
  }, []);

  // Debounced global search once the user types 3+ characters.
  // Stale results are hidden via the render guard below, so nothing needs a
  // synchronous reset when the query shrinks.
  const queryLongEnough = query.trim().length >= 3;

  useEffect(() => {
    if (!open || !queryLongEnough) return;
    const handle = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (response.ok) {
          const data = (await response.json()) as SearchResults;
          setResults(data);
        }
      } catch {
        // Search is best-effort in the palette.
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, open, queryLongEnough]);

  const run = useCallback((action: () => void) => {
    setOpen(false);
    setQuery("");
    action();
  }, []);

  const navigate = useCallback(
    (href: string) => {
      run(() => router.push(href));
    },
    [router, run],
  );

  const authed = role !== "guest";

  const studyItems = useMemo(
    () => [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Course Units", href: "/units", icon: BookOpen },
      { label: "Exam Zones", href: "/zones", icon: Layers },
      { label: "Question Bank", href: "/questions", icon: ClipboardCheck },
      { label: "Mock Exams", href: "/mocks", icon: GraduationCap },
      { label: "Flashcards", href: "/flashcards", icon: Atom },
      { label: "Past Papers", href: "/past-papers", icon: FileText },
      { label: "Outcomes Checklist", href: "/outcomes", icon: CalendarCheck },
    ],
    [],
  );

  const aiItems = useMemo(
    () => [
      { label: "Nova", href: "/ai/tutor", icon: BrainCircuit },
      { label: "Question of the Day", href: "/ai/daily", icon: Sparkles },
      { label: "Study Planner", href: "/planner", icon: Calendar },
    ],
    [],
  );

  const communityItems = useMemo(
    () => [
      { label: "Discussions", href: "/community", icon: MessagesSquare },
      { label: "Messages", href: "/messages", icon: MessageCircle },
      { label: "Leaderboard", href: "/leaderboard", icon: Trophy },
      { label: "Job Board", href: "/jobs", icon: SunMedium },
    ],
    [],
  );

  const youItems = useMemo(
    () => [
      { label: "Notifications", href: "/notifications", icon: Flame },
      { label: "Contribute Content", href: "/submit", icon: BookOpen },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
    [],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      description="Search notes, jump to a page or run an action"
    >
      <CommandInput
        placeholder="Search everything, or type a command…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="scrollbar-slim">
        <CommandEmpty>No results found.</CommandEmpty>

        {queryLongEnough && results.notes.length > 0 ? (
          <CommandGroup heading="Notes">
            {results.notes.slice(0, 5).map((note) => (
              <CommandItem
                key={note.id}
                value={`note ${note.title}`}
                onSelect={() => navigate(`/notes/${note.slug}`)}
              >
                <FileText className="size-4" aria-hidden />
                <span className="truncate">{note.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {queryLongEnough && results.questions.length > 0 ? (
          <CommandGroup heading="Questions">
            {results.questions.slice(0, 5).map((question) => (
              <CommandItem
                key={question.id}
                value={`question ${question.stem_md}`}
                onSelect={() =>
                  navigate(`/questions?q=${encodeURIComponent(question.stem_md.slice(0, 80))}`)
                }
              >
                <ClipboardCheck className="size-4" aria-hidden />
                <span className="truncate">
                  {question.stem_md.replace(/[*$\\]/g, "").slice(0, 90)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {queryLongEnough && results.discussions.length > 0 ? (
          <CommandGroup heading="Discussions">
            {results.discussions.slice(0, 5).map((discussion) => (
              <CommandItem
                key={discussion.id}
                value={`discussion ${discussion.title}`}
                onSelect={() => navigate(`/community/${discussion.id}`)}
              >
                <MessagesSquare className="size-4" aria-hidden />
                <span className="truncate">{discussion.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {authed ? (
          <>
            <CommandGroup heading="Study">
              {studyItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="AI & Planner">
              {aiItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Community">
              {communityItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="You">
              {youItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => navigate(item.href)}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </CommandItem>
              ))}
              {can("view_class_analytics") ? (
                <CommandItem value="go lecturer panel" onSelect={() => navigate("/lecturer")}>
                  <GraduationCap className="size-4" aria-hidden />
                  Lecturer Panel
                </CommandItem>
              ) : null}
              <CommandItem
                value="sign out logout"
                onSelect={() =>
                  run(async () => {
                    await signOut();
                    toast.success("Signed out. See you at the next revision session!");
                    router.push("/");
                  })
                }
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </CommandItem>
            </CommandGroup>
          </>
        ) : (
          <CommandGroup heading="Get started">
            <CommandItem value="login sign in" onSelect={() => navigate("/login")}>
              <LogOut className="size-4 rotate-180" aria-hidden />
              Sign in
            </CommandItem>
            <CommandItem value="signup create account" onSelect={() => navigate("/signup")}>
              <GraduationCap className="size-4" aria-hidden />
              Create account
            </CommandItem>
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="Theme">
          <CommandItem value="theme light" onSelect={() => run(() => setTheme("light"))}>
            <Sun className="size-4" aria-hidden />
            Light
            {resolvedTheme === "light" ? (
              <span className="text-primary ml-auto text-xs">active</span>
            ) : null}
          </CommandItem>
          <CommandItem value="theme dark" onSelect={() => run(() => setTheme("dark"))}>
            <Moon className="size-4" aria-hidden />
            Dark
            {resolvedTheme === "dark" ? (
              <span className="text-primary ml-auto text-xs">active</span>
            ) : null}
          </CommandItem>
          <CommandItem value="theme system" onSelect={() => run(() => setTheme("system"))}>
            <Settings className="size-4" aria-hidden />
            System
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Opens the palette from anywhere (topbar search button). */
export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent("biochem:open-search"));
}

export { Search as SearchIcon };
