"use client";

import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/** false during SSR + first paint, true after hydration — no setState needed. */
function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/** Instant Dark / Light / System toggle. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  const icon = !mounted ? (
    <Sun className="size-4" aria-hidden />
  ) : resolvedTheme === "dark" ? (
    <Moon className="size-4" aria-hidden />
  ) : (
    <Sun className="size-4" aria-hidden />
  );

  const options = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("focus-ring", className)}
          aria-label={`Switch theme (current: ${mounted ? theme : "system"})`}
        >
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => setTheme(option.value)}
            aria-checked={mounted && theme === option.value}
            className="gap-2"
          >
            <option.icon className="size-4" aria-hidden />
            {option.label}
            {mounted && theme === option.value ? (
              <span className="text-primary ml-auto text-xs">active</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
