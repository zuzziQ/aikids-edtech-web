import { describe, expect, it } from 'vitest'
import { buildCheckAnswersPayload } from './check-answers-payload'

describe('buildCheckAnswersPayload', () => {
  it('drops unanswered journey questions instead of filling the correct answer', () => {
    expect(buildCheckAnswersPayload({
      summaryAnswers: [
        { questionId: 'bai-1-1-q1', optionIndex: 2 },
        { questionId: 'bai-1-1-q2', optionIndex: -1 },
      ],
      checkQuestions: [{ id: 'bai-1-1-check-1' }],
    })).toEqual([{ questionId: 'bai-1-1-q1', optionIndex: 2 }])
  })

  it('prefers real rule journey answers over the legacy rule fallback', () => {
    expect(buildCheckAnswersPayload({
      summaryAnswers: [{ questionId: 'q1-1', optionIndex: 0 }],
      ruleQuestions: [{ id: 'q1-1', correctIndex: 1 }, { id: 'q1-2', correctIndex: 1 }],
    })).toEqual([{ questionId: 'q1-1', optionIndex: 0 }])
  })

  it('never fills correct answers for a rule journey with an unanswered quiz', () => {
    expect(buildCheckAnswersPayload({
      summaryAnswers: [
        { questionId: 'q1-1', optionIndex: -1 },
        { questionId: 'q1-2', optionIndex: -1 },
      ],
      ruleQuestions: [{ id: 'q1-1', correctIndex: 1 }, { id: 'q1-2', correctIndex: 1 }],
    })).toEqual([])
    expect(buildCheckAnswersPayload({
      ruleQuestions: [{ id: 'q1-1', correctIndex: 1 }],
    })).toEqual([])
  })

  it('submits only answered legacy check questions', () => {
    expect(buildCheckAnswersPayload({
      checkQuestions: [{ id: 'a' }, { id: 'b' }],
      checkAnswers: { a: 1 },
    })).toEqual([{ questionId: 'a', optionIndex: 1 }])
  })
})
