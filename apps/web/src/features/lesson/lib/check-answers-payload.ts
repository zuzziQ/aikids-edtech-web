export type CheckAnswer = { questionId: string; optionIndex: number }

type Input = {
  summaryAnswers?: Array<{ questionId: string; optionIndex: number }>
  ruleQuestions?: Array<{ id: string; correctIndex?: number }> | null
  checkQuestions?: Array<{ id: string }> | null
  checkAnswers?: Record<string, number | undefined> | null
}

/**
 * Answers sent to `/compat/lessons/:id/check`. Only questions the learner
 * actually answered are submitted; the server grades the rest as wrong.
 *
 * `summaryAnswers` (journey renderers) is authoritative whenever it is
 * provided, even if every entry is unanswered: never substitute the correct
 * option for the learner. `ruleQuestions` is kept for call-site compatibility
 * but no longer produces answers (the local rule quiz that justified the old
 * fallback is no longer rendered).
 */
export function buildCheckAnswersPayload({
  summaryAnswers,
  checkQuestions,
  checkAnswers,
}: Input): CheckAnswer[] {
  if (Array.isArray(summaryAnswers)) {
    return summaryAnswers.filter(
      (a) => typeof a.questionId === 'string' && a.questionId.length > 0 && Number.isInteger(a.optionIndex) && a.optionIndex >= 0,
    )
  }
  return (checkQuestions ?? []).flatMap((q) => {
    const optionIndex = checkAnswers?.[q.id]
    return typeof optionIndex === 'number' && Number.isInteger(optionIndex) && optionIndex >= 0
      ? [{ questionId: q.id, optionIndex }]
      : []
  })
}
