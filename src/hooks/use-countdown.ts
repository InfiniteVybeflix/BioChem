"use client";

import { useEffect, useState } from "react";

/** True while the countdown target is in the future; ticks every second. */
export function useCountdown(target: string | Date | null | undefined): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
} {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);

  if (!target) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: false };

  const targetMs = typeof target === "string" ? new Date(target).getTime() : target.getTime();
  const diff = Math.max(0, targetMs - now);

  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
    expired: diff <= 0,
  };
}
