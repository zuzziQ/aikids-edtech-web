/**
 * Quiz star thresholds. Must match core-lms-api `gradeLesson`
 * (src/modules/learning/learning.service.ts): the server only marks a lesson
 * passed at 3 stars, so the UI must never show 3 stars for a score the server
 * will reject.
 */
export const QUIZ_THREE_STAR_PERCENT = 80
export const QUIZ_TWO_STAR_PERCENT = 60

export function quizStarsFromScore(correct: number, total: number): 1 | 2 | 3 {
  if (!Number.isFinite(total) || total <= 0) return 1
  const percent = Math.round((Math.max(0, correct) / total) * 100)
  if (percent >= QUIZ_THREE_STAR_PERCENT) return 3
  if (percent >= QUIZ_TWO_STAR_PERCENT) return 2
  return 1
}
