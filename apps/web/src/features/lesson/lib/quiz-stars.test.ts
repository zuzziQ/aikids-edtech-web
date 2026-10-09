import { describe, expect, it } from 'vitest'
import { quizStarsFromScore } from './quiz-stars'

describe('quizStarsFromScore (mirrors core-lms-api gradeLesson)', () => {
  it('gives 3 stars at 80% so 4/5 passes on both web and server', () => {
    expect(quizStarsFromScore(4, 5)).toBe(3)
    expect(quizStarsFromScore(5, 5)).toBe(3)
  })

  it('keeps 2/3 and 3/4 below the pass line', () => {
    expect(quizStarsFromScore(2, 3)).toBe(2)
    expect(quizStarsFromScore(3, 4)).toBe(2)
  })

  it('gives 1 star under 60% and for empty quizzes', () => {
    expect(quizStarsFromScore(1, 2)).toBe(1)
    expect(quizStarsFromScore(0, 5)).toBe(1)
    expect(quizStarsFromScore(0, 0)).toBe(1)
  })
})
