import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, StudyPlanWeek } from "@/types/domain";
import { gatewayChat, type GatewayMessage } from "@/lib/ai/gateway";
import { STUDY_PLAN_PROMPT, extractJsonArray } from "@/lib/ai/prompts";
import { toJson } from "@/types/domain";

/**
 * AI study-plan generation. `client` is the caller's Supabase client
 * (RLS-scoped in the API route, service-role in the queue processor).
 */

const planWeekSchema = z.object({
  week: z.number().int().min(1),
  focus: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1),
  days: z
    .array(
      z.object({
        day: z.string().min(1),
        task: z.string().min(1),
        minutes: z.number().int().min(1).optional(),
      }),
    )
    .min(1),
});

export interface StudyPlanRequest {
  syllabus: string;
  weeks: number;
  examDate?: string;
  hoursPerWeek?: number;
}

export async function generateStudyPlan(
  client: SupabaseClient<Database>,
  userId: string,
  request: StudyPlanRequest,
): Promise<{ planId: string; weeks: StudyPlanWeek[] }> {
  const parameters = [
    `Plan horizon: ${request.weeks} weeks.`,
    request.examDate ? `Exam date: ${request.examDate}.` : null,
    request.hoursPerWeek
      ? `Study time available: about ${request.hoursPerWeek} hours per week.`
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  const messages: GatewayMessage[] = [
    { role: "system", content: STUDY_PLAN_PROMPT },
    {
      role: "user",
      content: `Syllabus / topics to cover:\n${request.syllabus}\n\n${parameters}`,
    },
  ];

  const result = await gatewayChat("study_plan", messages);
  const raw = extractJsonArray(result.content);

  const weeks: StudyPlanWeek[] = [];
  for (const element of raw) {
    const parsed = planWeekSchema.safeParse(element);
    if (parsed.success) weeks.push(parsed.data);
  }
  if (weeks.length === 0) {
    throw new Error("The model returned no valid study plan weeks — please try again");
  }

  const { data: plan, error } = await client
    .from("study_plans")
    .insert({
      user_id: userId,
      title: "Study plan",
      source: "ai",
      raw_input: request.syllabus,
      plan: toJson(weeks),
      active: true,
    })
    .select("id")
    .single();
  if (error || !plan) {
    throw new Error(`Failed to save study plan: ${error?.message ?? "unknown error"}`);
  }

  return { planId: plan.id, weeks };
}
