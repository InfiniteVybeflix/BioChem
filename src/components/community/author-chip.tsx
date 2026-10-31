import { BadgeCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ProfileLite } from "@/components/community/types";
import { cn } from "@/lib/utils";

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Verified-style badge shown next to lecturer and admin names. */
export function StaffBadge({ role, className }: { role: ProfileLite["role"]; className?: string }) {
  if (role === "student") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-primary/40 bg-primary/10 text-primary gap-1",
        role === "admin" &&
          "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        className,
      )}
    >
      <BadgeCheck className="size-3" aria-hidden />
      {role === "admin" ? "Admin" : "Lecturer"}
    </Badge>
  );
}

/** Author chip: avatar + name (+ staff badge). Falls back gracefully. */
export function AuthorChip({
  author,
  size = "sm",
  showBadge = true,
  className,
}: {
  author: ProfileLite | null;
  size?: "sm" | "md";
  showBadge?: boolean;
  className?: string;
}) {
  const name = author?.full_name ?? "Unknown student";
  const dimension = size === "md" ? "size-9" : "size-7";
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar className={cn(dimension, "shrink-0")}>
        {author?.avatar_url ? (
          <AvatarImage src={author.avatar_url} alt={`Avatar of ${name}`} />
        ) : null}
        <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-bold">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-foreground/90 min-w-0 truncate text-sm font-medium">{name}</span>
      {showBadge && author ? <StaffBadge role={author.role} /> : null}
    </span>
  );
}
