import type { AttemptAnswer, QuestionOption } from "@/types/domain";

export interface GradableQuestion {
  id: string;
  type: "mcq" | "short_answer" | "long_answer" | "structured";
  options: QuestionOption[];
  answer_key: string;
  marks: number;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 .,;:()\-–]/g, "")
    .trim();
}

/**
 * Grades one answer against a question's key.
 * - MCQ: exact key match (case-insensitive).
 * - Free-text: normalised containment match against the model answer —
 *   strict enough to be meaningful, lenient enough for phrasing variants.
 *   Structured/long answers award proportional credit for each matched key term.
 */
export function gradeAnswer(question: GradableQuestion, answer: AttemptAnswer | undefined) {
  if (!answer) {
    return { correct: false, marksAwarded: 0 };
  }

  if (question.type === "mcq") {
    const selected = (answer.selected ?? "").trim();
    const correct = selected.length > 0 && selected === question.answer_key.trim();
    return { correct, marksAwarded: correct ? question.marks : 0 };
  }

  const text = (answer.text ?? "").trim();
  if (text.length === 0) {
    return { correct: false, marksAwarded: 0 };
  }

  const key = normalise(question.answer_key);
  const response = normalise(text);

  if (question.type === "short_answer") {
    // The raw key may list acceptable alternatives separated by " / ".
    // Split BEFORE normalising (normalisation strips the slash).
    const alternatives = question.answer_key
      .split(/\s*\/\s*/)
      .map((alt) => normalise(alt))
      .filter((alt) => alt.length > 0);
    const correct = alternatives.some((alt) => response.includes(alt));
    return { correct, marksAwarded: correct ? question.marks : 0 };
  }

  // long_answer / structured: proportional credit on key terms.
  const keyTerms = key
    .split(/[,.;:]|\band\b|\bor\b/)
    .map((term) => term.trim())
    .filter((term) => term.length > 3);

  if (keyTerms.length === 0) {
    const correct = response.includes(key);
    return { correct, marksAwarded: correct ? question.marks : 0 };
  }

  const matched = keyTerms.filter((term) => response.includes(term));
  const ratio = matched.length / keyTerms.length;
  const marksAwarded = Math.round(question.marks * ratio * 100) / 100;

  return { correct: ratio >= 0.5, marksAwarded };
}

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: Record<string, AttemptAnswer>,
) {
  let score = 0;
  let maxScore = 0;
  const perQuestion: Record<string, AttemptAnswer> = {};

  for (const question of questions) {
    maxScore += question.marks;
    const result = gradeAnswer(question, answers[question.id]);
    score += result.marksAwarded;
    perQuestion[question.id] = {
      ...answers[question.id],
      marksAwarded: result.marksAwarded,
      correct: result.correct,
    };
  }

  return {
    score: Math.round(score * 100) / 100,
    maxScore,
    answers: perQuestion,
    percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
  };
}

/** Letter grade band used on the review screen. */
export function gradeBand(percentage: number): {
  label: string;
  tone: "great" | "good" | "warn" | "bad";
} {
  if (percentage >= 80) return { label: "Distinction", tone: "great" };
  if (percentage >= 65) return { label: "Credit", tone: "good" };
  if (percentage >= 50) return { label: "Pass", tone: "warn" };
  return { label: "Below pass", tone: "bad" };
}
