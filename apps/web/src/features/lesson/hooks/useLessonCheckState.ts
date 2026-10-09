import { useCallback, useState } from 'react'
import { ApiError, clearApiCache, type QuestDetail } from '@/shared/lib/api'
import { queryClient } from '@/shared/lib/query-client'
import { findCourseByIdentifier } from '@/features/world/pages/WorldPage'
import { learningApi } from '@/shared/lib/learning-api'
import { clampStationStars } from '@/shared/lib/star-progress'
import type { Phase } from '@/features/lesson/components/LessonInteractiveSidebar'
import type { GameHint } from '@/features/lesson/components/games/types'

export interface CheckResultData {
  stars: number
  message: string
  nextQuestId: string | null
  newAchievements?: string[]
  courseCredential?: string | null
}

export interface UseLessonCheckStateProps {
  quest: QuestDetail | null
  questId: string
  phase: Phase
  setPhase: (phase: Phase) => void
  setError: (err: string | null) => void
  setBusy: (busy: boolean) => void
  liveStars: number
  setLiveStars: React.Dispatch<React.SetStateAction<number>>
  setStarBurst: (sb: { id: number; count: number } | null) => void
  setGameHint: (hint: GameHint | null) => void
  recoverCurrentPhase: (err: unknown) => boolean
  is5StageJourney: boolean
  isAikiRuleJourney: boolean
  ruleData: any
}

export function useLessonCheckState({
  quest,
  questId,
  phase,
  setPhase,
  setError,
  setBusy,
  liveStars,
  setLiveStars,
  setStarBurst,
  setGameHint,
  recoverCurrentPhase,
  is5StageJourney,
  isAikiRuleJourney,
  ruleData,
}: UseLessonCheckStateProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [answerFeedback, setAnswerFeedback] = useState<
    Record<string, { correct: boolean; explanation: string }>
  >({})
  const [checkingQuestionId, setCheckingQuestionId] = useState<string | null>(null)
  const [lastActiveQuestionId, setLastActiveQuestionId] = useState<string | null>(null)
  const [checkResult, setCheckResult] = useState<CheckResultData | null>(null)

  const allCheckAnswersCorrect = Boolean(
    quest?.check &&
      quest.check.length > 0 &&
      quest.check.every((question) => answerFeedback[question.id]?.correct),
  )

  const submitCheck = useCallback(async () => {
    if (!quest) return
    const missing = quest.check.filter((q) => answers[q.id] === undefined)
    if (missing.length > 0) {
      setError('Hãy chọn đáp án cho mọi câu hỏi nhé!')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (phase === 'learn') {
        await learningApi.advanceLesson(questId, { fromPhase: 'learn' }).catch(() => null)
      } else if (phase === 'game') {
        await learningApi.advanceLesson(questId, { fromPhase: 'game' }).catch(() => null)
      } else if (phase === 'practice') {
        await learningApi.advanceLesson(questId, { fromPhase: 'practice' }).catch(() => null)
      }

      const res = await learningApi.submitCheck(questId, {
        answers: quest.check.map((q) => ({
          questionId: q.id,
          optionIndex: answers[q.id] as number,
        })),
      })
      if (res.passed === false) {
        setError(res.message)
        return
      }
      const confirmedStars = clampStationStars(res.stars)
      setLiveStars(confirmedStars)
      setStarBurst({ id: Date.now(), count: 1 })
      setCheckResult({ ...res, stars: confirmedStars })
      setPhase('done')
      setGameHint(null)
      clearApiCache()
      window.dispatchEvent(
        new CustomEvent('aikids:xp-updated', {
          detail: {
            stars: confirmedStars,
            ...(typeof res.totalXp === 'number' && typeof res.level === 'number'
              ? { xp: res.totalXp, level: res.level }
              : {}),
          },
        }),
      )
    } catch (e) {
      const isAlreadyCompleted =
        (e instanceof ApiError && (e.status === 409 || e.status === 422)) ||
        (e instanceof Error &&
          (e.message.includes('409') ||
            e.message.includes('CHECKPOINT_REQUIRED') ||
            e.message.includes('422') ||
            e.message.includes('INCOMPLETE_CHECK') ||
            e.message.includes('Lesson phase changed') ||
            e.message.includes('phase_mismatch')))

      if (isAlreadyCompleted) {
        const confirmedStars = liveStars > 0 ? liveStars : 2
        setLiveStars(confirmedStars)
        setStarBurst({ id: Date.now(), count: 1 })
        let nextQuestId: string | null = null
        try {
          if (quest?.courseId) {
            let targetCourseId = quest.courseId
            if (
              targetCourseId.startsWith('dao-') ||
              !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                targetCourseId,
              )
            ) {
              const pathway = await learningApi.getPathway().catch(() => null)
              if (pathway?.courses) {
                const matchedCourse =
                  pathway.courses.find(
                    (c) =>
                      c.id === targetCourseId ||
                      c.slug === targetCourseId ||
                      (c.slug && c.slug.startsWith(`${targetCourseId}-`)),
                  ) || findCourseByIdentifier(pathway.courses, targetCourseId)
                if (matchedCourse?.id) {
                  targetCourseId = matchedCourse.id
                }
              }
            }
            const p = await learningApi.getCourseProgress(targetCourseId).catch(() => null)
            const next = p?.quests?.find(
              (q) =>
                q.order === quest.order + 1 &&
                (q.status === 'available' ||
                  q.status === 'in_progress' ||
                  q.status === 'completed'),
            )
            nextQuestId = next?.id ?? null
          }
        } catch {
          /* ignore */
        }
        setCheckResult({
          stars: confirmedStars,
          message: 'Con đã hoàn thành bài học này rồi!',
          nextQuestId,
        })
        setPhase('done')
        setGameHint(null)
        clearApiCache()
        window.dispatchEvent(
          new CustomEvent('aikids:xp-updated', { detail: { stars: confirmedStars } }),
        )
        void queryClient.invalidateQueries({ queryKey: ['progression'] })
        void queryClient.invalidateQueries({ queryKey: ['pathway'] })
        void queryClient.invalidateQueries({ queryKey: ['course-progress'] })
      } else if (!recoverCurrentPhase(e)) {
        setError(e instanceof Error ? e.message : 'Chưa gửi được')
      }
    } finally {
      setBusy(false)
    }
  }, [
    quest,
    answers,
    setError,
    setBusy,
    phase,
    questId,
    setLiveStars,
    setStarBurst,
    setPhase,
    setGameHint,
    liveStars,
    recoverCurrentPhase,
  ])

  const chooseCheckAnswer = useCallback(
    async (questionId: string, optionIndex: number) => {
      if (answerFeedback[questionId]?.correct || checkingQuestionId) return
      setAnswers((current) => ({ ...current, [questionId]: optionIndex }))
      setCheckingQuestionId(questionId)
      setLastActiveQuestionId(questionId)
      setError(null)

      if (is5StageJourney) {
        const firstCheck = quest?.check?.[0] as any
        const correctIdx =
          typeof firstCheck?.correctIndex === 'number'
            ? firstCheck.correctIndex
            : (ruleData?.questions?.[0]?.correctIndex ?? 1)
        const isCorrect = optionIndex === correctIdx
        const explanation = isCorrect
          ? firstCheck?.explain ||
            firstCheck?.explanation ||
            (isAikiRuleJourney
              ? 'Tuyệt vời! Con chọn hoàn toàn chính xác! Bức tranh của Sonet có chi tiết Bố cầm vợt muỗi — câu chuyện thật độc nhất của riêng bạn ấy!'
              : 'Tuyệt vời! Con đã chọn phương án chính xác!')
          : isAikiRuleJourney
            ? 'Bức này quen thuộc quá, ai cũng có thể vẽ được giống hệt nhau. Bé hãy thử lại bức của Sonet xem sao nhé!'
            : 'Chưa đúng rồi! Con hãy quan sát lại 2 bức tranh bên trái và xem gợi ý của Coach Mee nhé!'

        setAnswerFeedback((current) => ({
          ...current,
          [questionId]: {
            correct: isCorrect,
            explanation,
          },
        }))

        if (isCorrect) {
          setLiveStars((s) => Math.min(3, s + 1))
          setStarBurst({ id: Date.now(), count: 1 })
        }

        try {
          await learningApi.checkAnswer(questId, {
            questionId,
            optionIndex,
          })
        } catch {
          // Luồng 5 chặng: Bảo lưu phản hồi visual cho học sinh, không xoá lựa chọn
        } finally {
          setCheckingQuestionId(null)
        }
        return
      }

      try {
        const feedback = await learningApi.checkAnswer(questId, {
          questionId,
          optionIndex,
        })
        setAnswerFeedback((current) => ({
          ...current,
          [questionId]: {
            correct: feedback.correct,
            explanation: feedback.explanation,
          },
        }))
      } catch (e) {
        setAnswers((current) => {
          const next = { ...current }
          delete next[questionId]
          return next
        })
        setError(e instanceof Error ? e.message : 'Chưa kiểm tra được đáp án')
      } finally {
        setCheckingQuestionId(null)
      }
    },
    [
      answerFeedback,
      checkingQuestionId,
      setError,
      is5StageJourney,
      quest?.check,
      ruleData?.questions,
      isAikiRuleJourney,
      questId,
      setLiveStars,
      setStarBurst,
    ],
  )

  const resetCheck = useCallback(() => {
    setAnswers({})
    setAnswerFeedback({})
    setCheckingQuestionId(null)
    setLastActiveQuestionId(null)
    setCheckResult(null)
  }, [])

  return {
    answers,
    setAnswers,
    answerFeedback,
    setAnswerFeedback,
    checkingQuestionId,
    setCheckingQuestionId,
    lastActiveQuestionId,
    setLastActiveQuestionId,
    checkResult,
    setCheckResult,
    allCheckAnswersCorrect,
    submitCheck,
    chooseCheckAnswer,
    resetCheck,
  }
}
