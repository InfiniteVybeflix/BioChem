"use client";

import { useCallback, useState } from "react";
import { Calendar, CalendarDays, GraduationCap, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EventDialog,
  eventValuesToRow,
  type EventDialogPrefill,
  type EventFormValues,
} from "@/components/planner/event-dialog";
import { TimetableGrid } from "@/components/planner/timetable-grid";
import { MonthCalendar } from "@/components/planner/month-calendar";
import { ExamCountdowns } from "@/components/planner/exam-countdowns";
import { AiWeekPlanner } from "@/components/planner/ai-week-planner";
import { TodayStrip } from "@/components/planner/today-strip";
import type { PlanEventRow, StudyPlanRow } from "@/components/planner/planner-lib";
import { useUser } from "@/hooks/use-user";
import type { PlanEventType } from "@/types/domain";

interface PlannerViewProps {
  initialEvents: PlanEventRow[];
  activePlans: StudyPlanRow[];
}

interface DialogState {
  open: boolean;
  mode: "create" | "edit";
  target: PlanEventRow | null;
  prefill: EventDialogPrefill;
  lockType: PlanEventType | null;
}

const CLOSED_DIALOG: DialogState = {
  open: false,
  mode: "create",
  target: null,
  prefill: {},
  lockType: null,
};

function sortByTime(events: PlanEventRow[]): PlanEventRow[] {
  return [...events].sort((a, b) => {
    const dayDiff =
      (a.day_of_week ?? 0) + (a.date ? 0 : 7) - ((b.day_of_week ?? 0) + (b.date ? 0 : 7));
    if (dayDiff !== 0) return dayDiff;
    return a.start_time.localeCompare(b.start_time);
  });
}

export function PlannerView({ initialEvents, activePlans }: PlannerViewProps) {
  const { supabase, userId } = useUser();
  const [tab, setTab] = useState("timetable");
  const [events, setEvents] = useState<PlanEventRow[]>(initialEvents);
  const [dialog, setDialog] = useState<DialogState>(CLOSED_DIALOG);

  const openCreate = useCallback(
    (prefill: EventDialogPrefill = {}, lockType: PlanEventType | null = null) => {
      setDialog({ open: true, mode: "create", target: null, prefill, lockType });
    },
    [],
  );

  const openEdit = useCallback((event: PlanEventRow) => {
    setDialog({ open: true, mode: "edit", target: event, prefill: {}, lockType: null });
  }, []);

  const createEvent = useCallback(
    async (values: EventFormValues): Promise<boolean> => {
      if (!supabase || !userId) {
        toast.error("Sign in to plan events");
        return false;
      }
      const { data, error } = await supabase
        .from("plan_events")
        .insert({ ...eventValuesToRow(values), user_id: userId })
        .select("*")
        .single();
      if (error || !data) {
        toast.error("Couldn't add the event", { description: error?.message });
        return false;
      }
      setEvents((prev) => sortByTime([...prev, data]));
      toast.success("Event added to your planner");
      return true;
    },
    [supabase, userId],
  );

  const updateEvent = useCallback(
    async (id: string, values: EventFormValues): Promise<boolean> => {
      if (!supabase) return false;
      const previous = events;
      const patch = eventValuesToRow(values);
      // Optimistic patch.
      setEvents((prev) => prev.map((event) => (event.id === id ? { ...event, ...patch } : event)));
      const { error } = await supabase.from("plan_events").update(patch).eq("id", id);
      if (error) {
        setEvents(previous);
        toast.error("Couldn't save the event", { description: error.message });
        return false;
      }
      toast.success("Event updated");
      return true;
    },
    [supabase, events],
  );

  /** Drag & drop: move an event to another day (recurring) or date (one-off). */
  const moveEvent = useCallback(
    async (id: string, changes: { dayOfWeek: number | null; date: string | null }) => {
      if (!supabase) return;
      const target = events.find((event) => event.id === id);
      if (!target) return;
      const unchanged = changes.dayOfWeek === target.day_of_week && changes.date === target.date;
      if (unchanged) return;

      const previous = events;
      setEvents((prev) =>
        sortByTime(
          prev.map((event) =>
            event.id === id
              ? { ...event, day_of_week: changes.dayOfWeek, date: changes.date }
              : event,
          ),
        ),
      );
      const { error } = await supabase
        .from("plan_events")
        .update({ day_of_week: changes.dayOfWeek, date: changes.date })
        .eq("id", id);
      if (error) {
        setEvents(previous);
        toast.error("Couldn't move the event", { description: error.message });
        return;
      }
      toast.success("Event moved");
    },
    [supabase, events],
  );

  const deleteEvent = useCallback(
    async (id: string): Promise<boolean> => {
      if (!supabase) return false;
      const previous = events;
      setEvents((prev) => prev.filter((event) => event.id !== id));
      const { error } = await supabase.from("plan_events").delete().eq("id", id);
      if (error) {
        setEvents(previous);
        toast.error("Couldn't delete the event", { description: error.message });
        return false;
      }
      toast.success("Event removed");
      return true;
    },
    [supabase, events],
  );

  const toggleCompleted = useCallback(
    async (event: PlanEventRow, completed: boolean) => {
      if (!supabase) return;
      setEvents((prev) =>
        prev.map((item) => (item.id === event.id ? { ...item, completed } : item)),
      );
      const { error } = await supabase.from("plan_events").update({ completed }).eq("id", event.id);
      if (error) {
        setEvents((prev) =>
          prev.map((item) =>
            item.id === event.id ? { ...item, completed: event.completed } : item,
          ),
        );
        toast.error("Couldn't update the event", { description: error.message });
      }
    },
    [supabase],
  );

  /** Bulk-insert AI-generated study blocks; returns the number inserted. */
  const bulkCreateStudy = useCallback(
    async (rows: EventFormValues[]): Promise<number> => {
      if (!supabase || !userId || rows.length === 0) return 0;
      const { data, error } = await supabase
        .from("plan_events")
        .insert(rows.map((row) => ({ ...eventValuesToRow(row), user_id: userId })))
        .select("*");
      if (error || !data) {
        toast.error("Couldn't add the plan to your timetable", { description: error?.message });
        return 0;
      }
      setEvents((prev) => sortByTime([...prev, ...data]));
      return data.length;
    },
    [supabase, userId],
  );

  return (
    <div className="space-y-4">
      <TodayStrip events={events} onToggleCompleted={toggleCompleted} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="timetable" className="gap-1.5">
            <CalendarDays className="size-4" aria-hidden />
            Timetable
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="size-4" aria-hidden />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="exams" className="gap-1.5">
            <GraduationCap className="size-4" aria-hidden />
            Exams
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5">
            <Sparkles className="size-4" aria-hidden />
            AI planner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timetable" className="mt-4">
          <TimetableGrid
            events={events}
            onCreate={openCreate}
            onEdit={openEdit}
            onMove={moveEvent}
            onToggleCompleted={toggleCompleted}
          />
        </TabsContent>
        <TabsContent value="calendar" className="mt-4">
          <MonthCalendar
            events={events}
            onCreate={openCreate}
            onEdit={openEdit}
            onToggleCompleted={toggleCompleted}
          />
        </TabsContent>
        <TabsContent value="exams" className="mt-4">
          <ExamCountdowns
            events={events}
            onAddExam={() => openCreate({ type: "exam" }, "exam")}
            onEdit={openEdit}
          />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <AiWeekPlanner
            activePlans={activePlans}
            onBulkCreate={bulkCreateStudy}
            onPlanned={() => setTab("timetable")}
          />
        </TabsContent>
      </Tabs>

      <EventDialog
        key={`${dialog.mode}-${dialog.target?.id ?? "new"}-${dialog.prefill.dayOfWeek ?? ""}-${dialog.prefill.date ?? ""}-${dialog.prefill.startTime ?? ""}-${dialog.lockType ?? ""}`}
        open={dialog.open}
        onOpenChange={(open) => setDialog((prev) => (open ? prev : CLOSED_DIALOG))}
        mode={dialog.mode}
        target={dialog.target}
        prefill={dialog.prefill}
        lockType={dialog.lockType}
        onCreate={createEvent}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
      />
    </div>
  );
}
