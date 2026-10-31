import { z } from "zod";
import { gatewayChat, type GatewayMessage } from "@/lib/ai/gateway";
import { WEEK_PLANNER_PROMPT, extractJsonArray } from "@/lib/ai/prompts";
import type { PlanEventType } from "@/types/domain";

/**
 * AI week planner: maps the student's free time slots and revision goals onto
 * a suggested schedule of plan events. Interactive only (never queued) — the
 * caller returns the events for the planner UI to insert.
 */

export interface FreeSlot {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

export interface PlannedEvent {
  day_of_week: number;
  start_time: string;
  end_time: string;
  title: string;
  type: PlanEventType;
}

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

const plannedEventSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(hhmm),
  end_time: z.string().regex(hhmm),
  title: z.string().min(1).max(160),
  type: z.enum(["study", "class", "exam", "personal", "deadline"]),
});

/** True when the event sits fully inside one of the provided free slots. */
function fitsInsideSlot(event: z.infer<typeof plannedEventSchema>, slots: FreeSlot[]): boolean {
  return slots.some(
    (slot) =>
      slot.day_of_week === event.day_of_week &&
      event.start_time >= slot.start_time &&
      event.end_time <= slot.end_time &&
      event.start_time < event.end_time,
  );
}

export async function generateWeekPlan(
  freeSlots: FreeSlot[],
  goals: string[],
): Promise<PlannedEvent[]> {
  const messages: GatewayMessage[] = [
    { role: "system", content: WEEK_PLANNER_PROMPT },
    {
      role: "user",
      content: `Free time slots (day_of_week 0=Sunday, times HH:MM):\n${JSON.stringify(freeSlots)}\n\nRevision goals:\n${JSON.stringify(goals)}`,
    },
  ];

  const result = await gatewayChat("week_planner", messages);
  const raw = extractJsonArray(result.content);

  const events: PlannedEvent[] = [];
  for (const element of raw) {
    const parsed = plannedEventSchema.safeParse(element);
    // Discard anything the model scheduled outside the declared free time.
    if (parsed.success && fitsInsideSlot(parsed.data, freeSlots)) {
      events.push(parsed.data);
    }
  }
  if (events.length === 0) {
    throw new Error("The model returned no valid events for your free slots — please try again");
  }

  return events;
}
