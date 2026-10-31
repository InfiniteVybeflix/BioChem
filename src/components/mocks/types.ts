import type {
  AttemptAnswer,
  AttemptConfig,
  AttemptMode,
  AttemptStatus,
  Difficulty,
  ExamZone,
  QuestionOption,
  QuestionType,
} from "@/types/domain";

/**
 * Shared shapes for the mocks module. These mirror the JSON payloads returned
 * by /api/mocks* and are consumed by the client components.
 */

/** A question inside a runner payload. `answerKey` / `explanationMd` are only
 * present once the attempt has been submitted (the API strips them while the
 * attempt is still in progress). */
export interface RunnerQuestion {
  id: string;
  type: QuestionType;
  stemMd: string;
  options: QuestionOption[];
  marks: number;
  difficulty: Difficulty;
  zone: ExamZone;
  answerKey?: string;
  explanationMd?: string;
}

/** An exam attempt as delivered to clients (camelCase mapped from rows). */
export interface RunnerAttempt {
  id: string;
  zone: ExamZone;
  mode: AttemptMode;
  status: AttemptStatus;
  config: AttemptConfig;
  score: number;
  maxScore: number;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  answers: Record<string, AttemptAnswer>;
  examTitle: string | null;
}

/** Response of `GET /api/mocks/[id]` and `POST /api/mocks/[id]/submit`. */
export interface RunnerPayload {
  attempt: RunnerAttempt;
  questions: RunnerQuestion[];
}

/** Row of the attempts history list on the mock hub. */
export interface AttemptListItem {
  id: string;
  zone: ExamZone;
  mode: AttemptMode;
  status: AttemptStatus;
  score: number;
  maxScore: number;
  config: AttemptConfig;
  startedAt: string;
  submittedAt: string | null;
  durationSeconds: number | null;
  examTitle: string | null;
}
