"use client";

import { useState } from "react";
import { BookOpen, Crown, Medal, Trophy, Zap } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface LeaderboardEntry {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  points: number;
  contributions: number;
}

interface LeaderboardProps {
  allTime: LeaderboardEntry[];
  month: LeaderboardEntry[];
  currentUserId: string | null;
  monthLabel: string;
}

const MEDAL_STYLES: Record<number, { card: string; badge: string; label: string }> = {
  1: {
    card: "border-amber-400/60 bg-amber-400/15",
    badge: "bg-amber-400 text-amber-950",
    label: "1st",
  },
  2: {
    card: "border-slate-300/60 bg-slate-300/15",
    badge: "bg-slate-300 text-slate-900",
    label: "2nd",
  },
  3: {
    card: "border-amber-700/60 bg-amber-700/15",
    badge: "bg-amber-700 text-amber-50",
    label: "3rd",
  },
};

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function displayName(entry: LeaderboardEntry): string {
  return entry.name?.trim() || "Anonymous student";
}

function PodiumCard({
  entry,
  rank,
  isYou,
  className,
}: {
  entry: LeaderboardEntry;
  rank: 1 | 2 | 3;
  isYou: boolean;
  className?: string;
}) {
  const medal = MEDAL_STYLES[rank];
  const name = displayName(entry);

  return (
    <article
      className={cn(
        "glass-card flex flex-col items-center gap-2 p-4 text-center transition-all hover:-translate-y-0.5",
        medal.card,
        rank === 1 && "sm:pt-6 sm:pb-8",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-xs font-bold",
          medal.badge,
        )}
      >
        {rank === 1 ? (
          <Crown className="size-3.5" aria-hidden />
        ) : (
          <Medal className="size-3.5" aria-hidden />
        )}
      </span>
      <Avatar className="size-14 sm:size-16">
        {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt={`Avatar of ${name}`} /> : null}
        <AvatarFallback className="bg-primary/15 text-primary text-sm font-bold">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center justify-center gap-1.5 truncate text-sm font-semibold">
          <span className="max-w-28 truncate">{name}</span>
          {isYou ? <Badge className="bg-primary/15 text-primary text-[10px]">You</Badge> : null}
        </p>
        <p className="font-heading text-primary mt-0.5 inline-flex items-center gap-1 text-lg font-bold tabular-nums">
          <Zap className="size-3.5" aria-hidden />
          {entry.points.toLocaleString()} XP
        </p>
        {entry.contributions > 0 ? (
          <p className="text-muted-foreground text-xs">
            {entry.contributions} contribution{entry.contributions === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** One ranked row (rank 4 and below). */
function RankRow({
  entry,
  rank,
  isYou,
}: {
  entry: LeaderboardEntry;
  rank: number;
  isYou: boolean;
}) {
  const name = displayName(entry);
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 sm:px-4",
        isYou && "bg-primary/10 ring-primary rounded-lg ring-1 ring-inset",
      )}
    >
      <span className="text-muted-foreground w-6 shrink-0 text-center text-sm font-semibold tabular-nums">
        {rank}
      </span>
      <Avatar className="size-8 shrink-0">
        {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} alt={`Avatar of ${name}`} /> : null}
        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-medium">{name}</span>
        {isYou ? <Badge className="bg-primary/15 text-primary text-[10px]">You</Badge> : null}
      </span>
      <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs tabular-nums">
        <BookOpen className="size-3.5" aria-hidden />
        {entry.contributions}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
        <Zap className="text-primary size-3.5" aria-hidden />
        {entry.points.toLocaleString()}
      </span>
    </li>
  );
}

function BoardList({
  entries,
  currentUserId: userId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
}) {
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-4">
      {podium.length > 0 ? (
        <div className="flex flex-col gap-3 sm:grid sm:grid-cols-3 sm:items-end">
          {podium[1] ? (
            <PodiumCard
              entry={podium[1]}
              rank={2}
              isYou={podium[1].userId === userId}
              className="order-2 sm:order-1"
            />
          ) : null}
          <PodiumCard
            entry={podium[0]}
            rank={1}
            isYou={podium[0].userId === userId}
            className="order-1 sm:order-2"
          />
          {podium[2] ? (
            <PodiumCard
              entry={podium[2]}
              rank={3}
              isYou={podium[2].userId === userId}
              className="order-3"
            />
          ) : null}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <ol className="glass-card divide-border/60 divide-y">
          {rest.map((entry, index) => (
            <RankRow
              key={entry.userId}
              entry={entry}
              rank={index + 4}
              isYou={entry.userId === userId}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function Leaderboard({ allTime, month, currentUserId, monthLabel }: LeaderboardProps) {
  const [tab, setTab] = useState("all-time");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="all-time" className="gap-1.5">
            <Trophy className="size-4" aria-hidden />
            All-time
          </TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5">
            <Zap className="size-4" aria-hidden />
            This month
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-time" className="mt-4">
          {allTime.length === 0 ? (
            <div className="glass-card px-6 py-12 text-center">
              <Trophy className="text-muted-foreground/60 mx-auto size-8" aria-hidden />
              <p className="font-heading mt-3 text-base font-semibold">No XP earned yet</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Be the first on the board — master an outcome or sit a mock to score XP.
              </p>
            </div>
          ) : (
            <BoardList entries={allTime} currentUserId={currentUserId} />
          )}
        </TabsContent>

        <TabsContent value="month" className="mt-4">
          <p className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
            {monthLabel}
          </p>
          {month.length === 0 ? (
            <div className="glass-card px-6 py-12 text-center">
              <Zap className="text-muted-foreground/60 mx-auto size-8" aria-hidden />
              <p className="font-heading mt-3 text-base font-semibold">
                No XP earned this month yet
              </p>
              <p className="text-muted-foreground mt-1 text-sm">Be the first on the board.</p>
            </div>
          ) : (
            <BoardList entries={month} currentUserId={currentUserId} />
          )}
        </TabsContent>
      </Tabs>

      <p className="text-muted-foreground text-xs">
        Earn XP by mastering outcomes, sitting mocks, reviewing flashcards and publishing notes.
      </p>
    </div>
  );
}
