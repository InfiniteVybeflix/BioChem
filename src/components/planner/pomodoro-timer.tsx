"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Pomodoro focus timer — 25 minutes on, 5 off (long break after four
 * rounds). Purely client-side; a soft chime marks each phase.
 */

const FOCUS_SECONDS = 25 * 60;
const SHORT_BREAK = 5 * 60;
const LONG_BREAK = 15 * 60;

function chime(): void {
  try {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.connect(gain);
    gain.connect(context.destination);
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.2);
    osc.start();
    osc.stop(context.currentTime + 1.25);
  } catch {
    // Audio is a nice-to-have — never block the timer.
  }
}

export function PomodoroTimer() {
  const [phase, setPhase] = useState<"focus" | "break" | "long">("focus");
  const [remaining, setRemaining] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev > 1) return prev - 1;
        // Phase complete.
        chime();
        setRunning(false);
        setCompleted((count) => (phase === "focus" ? count + 1 : count));
        if (phase === "focus") {
          const nextIsLong = (completed + 1) % 4 === 0;
          setPhase(nextIsLong ? "long" : "break");
          return nextIsLong ? LONG_BREAK : SHORT_BREAK;
        }
        setPhase("focus");
        return FOCUS_SECONDS;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, phase, completed]);

  const total = phase === "focus" ? FOCUS_SECONDS : phase === "break" ? SHORT_BREAK : LONG_BREAK;
  const progress = ((total - remaining) / total) * 100;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const reset = () => {
    setRunning(false);
    setPhase("focus");
    setRemaining(FOCUS_SECONDS);
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <Timer className="size-4" aria-hidden /> Focus timer
        </h3>
        <span className="text-muted-foreground text-xs">
          {completed} pomodoro{completed === 1 ? "" : "s"} today
        </span>
      </div>

      <p className="text-muted-foreground mt-1 text-xs">
        {phase === "focus"
          ? "25 minutes of deep revision"
          : phase === "break"
            ? "5-minute breather"
            : "15-minute long break"}
      </p>

      <p
        className={cn(
          "font-heading mt-4 text-center text-5xl font-bold tracking-tight tabular-nums",
          phase === "focus" ? "text-primary" : "text-emerald-500",
        )}
        aria-live="off"
      >
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </p>

      <div className="bg-muted mt-3 h-1.5 overflow-hidden rounded-full" aria-hidden>
        <div
          className={cn(
            "h-full transition-all duration-1000",
            phase === "focus" ? "bg-primary" : "bg-emerald-500",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 flex justify-center gap-2">
        <Button size="sm" className="gap-2" onClick={() => setRunning((prev) => !prev)}>
          {running ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
          {running ? "Pause" : remaining === total ? "Start" : "Resume"}
        </Button>
        <Button size="sm" variant="outline" className="gap-2" onClick={reset}>
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </Button>
      </div>
    </div>
  );
}
