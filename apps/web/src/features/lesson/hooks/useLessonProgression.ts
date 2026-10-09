import { useCallback, useRef } from 'react'
import { buildCheckAnswersPayload } from '../lib/check-answers-payload'
import { AIKI_RULES_DATA } from '@/features/rules/data/rules-data'
import { clearApiCache, type QuestDetail } from '@/shared/lib/api'
import { queryClient } from '@/shared/lib/query-client'
import { clearWorldPageCache } from '@/features/world/pages/WorldPage'
import { learningApi } from '@/shared/lib/learning-api'
import { queueOfflineProgress } from '@/features/lesson/lib/offline-learning'
import {
  saveLocalLessonProgress,
  queuePendingSync,
} from '@/shared/lib/learning-sync-store'
import type { Phase } from '@/features/lesson/components/LessonInteractiveSidebar'
import type { CheckResultData } from './useLessonCheckState'

export interface UseLessonProgressionProps {
  quest: QuestDetail | null
  setQuest: React.Dispatch<React.SetStateAction<QuestDetail | null>>
  questId: string
  authoritativeLessonId: string
  phase: Phase
  setPhase: (phase: Phase) => void
  setError: (err: string | null) => void
  setBusy: (busy: boolean) => void
  setLiveStars: React.Dispatch<React.SetStateAction<number>>
  checkResult: CheckResultData | null
  setCheckResult: (cr: CheckResultData | null) => void
  answers: Record<string, number>
  isAikiRuleJourney: boolean
  isIslandJourney: boolean
  ruleId: number
  hasAdvancedFromLearnRef: React.MutableRefObject<Record<string, boolean>>
  setResumeStageIndex: (idx: number) => void
  user: any
}

export function useLessonProgression({
  quest,
  setQuest,
  questId,
  authoritativeLessonId,
  phase,
  setPhase,
  setError,
  setBusy,
  setLiveStars,
  checkResult,
  setCheckResult,
  answers,
  isAikiRuleJourney,
  isIslandJourney,
  ruleId,
  hasAdvancedFromLearnRef,
  setResumeStageIndex,
  user,
}: UseLessonProgressionProps) {
  const finishLessonPromiseRef = useRef<Promise<boolean> | null>(null)

  const handleAikiFinish = useCallback(async (customSummary?: {
    answers?: Array<{ questionId: string; optionIndex: number }>
    stars?: number
    xp?: number
    nextLessonSlug?: string
    keepalive?: boolean
    practicePromise?: Promise<any>
  }) => {
    if (checkResult) return true
    if (finishLessonPromiseRef.current) return finishLessonPromiseRef.current
    if (!quest) return false
    const nextRuleTarget = isAikiRuleJourney && ruleId < 10 ? `rule-${ruleId + 1}` : null
    const currentRuleData = isAikiRuleJourney
      ? AIKI_RULES_DATA.find((r) => r.id === ruleId) || AIKI_RULES_DATA[0]
      : null

    const answersPayload = buildCheckAnswersPayload({
      summaryAnswers: customSummary?.answers,
      ruleQuestions: isAikiRuleJourney ? currentRuleData?.questions : null,
      checkQuestions: quest.check,
      checkAnswers: answers,
    })
    const finishPromise = (async () => {
      setBusy(true)
      try {
        if (customSummary?.practicePromise) {
          await customSummary.practicePromise.catch(() => null)
        }
        const lessonIdForSubmit = authoritativeLessonId || quest.id || questId
        if (phase === 'learn') {
          await learningApi.advanceLesson(lessonIdForSubmit, { fromPhase: 'learn' }).catch(() => null)
        } else if (phase === 'game') {
          await learningApi.advanceLesson(lessonIdForSubmit, { fromPhase: 'game' }).catch(() => null)
        } else if (phase === 'practice' && !customSummary?.practicePromise) {
          await learningApi.advanceLesson(lessonIdForSubmit, { fromPhase: 'practice' }).catch(() => null)
        }
        const checkRes = await learningApi.submitCheck(lessonIdForSubmit, {
          answers: answersPayload,
        })
        const serverPassed = checkRes?.passed !== false
        const serverStars = typeof checkRes?.stars === 'number' ? checkRes.stars : undefined
        if (!serverPassed) {
          const alreadyCompleted = quest.status === 'completed'
          const stars = Math.min(serverStars ?? 2, 2)
          setError(checkRes?.message || 'Con hãy xem lại những câu chưa đúng rồi thử lại nhé!')
          if (!alreadyCompleted) {
            setLiveStars(stars)
            try {
              saveLocalLessonProgress(
                authoritativeLessonId || quest.id || questId,
                stars,
                false,
                user?.id,
              )
            } catch {
              // ignore storage failure
            }
          }
          void queryClient.invalidateQueries({ queryKey: ['pathway'] })
          return false
        }
        const confirmedStars =
          serverStars && serverStars >= 1
            ? serverStars
            : customSummary?.stars && customSummary.stars >= 1
              ? customSummary.stars
              : 3
        const celebrationMsg = isIslandJourney
          ? `Xuất sắc! Con đã hoàn thành ${quest.title} và được hệ thống ghi nhận ${confirmedStars} Sao!`
          : confirmedStars >= 3
            ? 'Xuất sắc! Con đạt trọn 3 Sao. Chào mừng Hiệp Sĩ Sáng Tạo AIKI!'
            : `Xuất sắc! Con đạt ${confirmedStars} Sao.`
        const progressId = authoritativeLessonId || quest.id || questId

        if (confirmedStars >= 3) {
          quest.status = 'completed'
          setQuest((prev) => (prev ? { ...prev, status: 'completed' } : prev))
          setLiveStars(3)
          setPhase('done')
          setCheckResult({
            ...checkRes,
            stars: 3,
            message: celebrationMsg,
            nextQuestId: checkRes.nextQuestId || nextRuleTarget,
          })
          try {
            saveLocalLessonProgress(progressId, 3, true, user?.id)
            if (quest?.id && quest.id !== progressId)
              saveLocalLessonProgress(quest.id, 3, true, user?.id)
            if (questId && questId !== progressId)
              saveLocalLessonProgress(questId, 3, true, user?.id)
            if (authoritativeLessonId && authoritativeLessonId !== progressId)
              saveLocalLessonProgress(authoritativeLessonId, 3, true, user?.id)

            sessionStorage.removeItem(`aikids_stage_${quest.id}`)
            sessionStorage.removeItem(`aikids_stage_${questId}`)
            if (authoritativeLessonId)
              sessionStorage.removeItem(`aikids_stage_${authoritativeLessonId}`)
          } catch {
            // ignore storage failure
          }
          clearApiCache()
          clearWorldPageCache()
          window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
        } else {
          setLiveStars(confirmedStars)
          try {
            saveLocalLessonProgress(progressId, confirmedStars, false, user?.id)
            if (quest?.id && quest.id !== progressId)
              saveLocalLessonProgress(quest.id, confirmedStars, false, user?.id)
            if (questId && questId !== progressId)
              saveLocalLessonProgress(questId, confirmedStars, false, user?.id)
            if (authoritativeLessonId && authoritativeLessonId !== progressId)
              saveLocalLessonProgress(authoritativeLessonId, confirmedStars, false, user?.id)
          } catch {
            // ignore storage failure
          }
          clearApiCache()
          clearWorldPageCache()
          window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
        }

        window.dispatchEvent(
          new CustomEvent('aikids:xp-updated', {
            detail: {
              stars: confirmedStars,
              ...(typeof checkRes?.totalXp === 'number' && typeof checkRes?.level === 'number'
                ? { xp: checkRes.totalXp, level: checkRes.level }
                : {}),
            },
          }),
        )
        void queryClient.invalidateQueries({ queryKey: ['progression'] })
        void queryClient.invalidateQueries({ queryKey: ['pathway'] })
        void queryClient.invalidateQueries({ queryKey: ['course-progress'] })
        return true
      } catch (err: unknown) {
        console.warn('Submit check failed in handleAikiFinish, completing locally:', err)
        const progressId = authoritativeLessonId || quest.id || questId
        const confirmedStars =
          customSummary?.stars && customSummary.stars >= 1 ? customSummary.stars : 3

        saveLocalLessonProgress(progressId, confirmedStars, confirmedStars >= 3, user?.id)
        if (quest?.id && quest.id !== progressId)
          saveLocalLessonProgress(quest.id, confirmedStars, confirmedStars >= 3, user?.id)
        if (questId && questId !== progressId)
          saveLocalLessonProgress(questId, confirmedStars, confirmedStars >= 3, user?.id)
        if (authoritativeLessonId && authoritativeLessonId !== progressId)
          saveLocalLessonProgress(
            authoritativeLessonId,
            confirmedStars,
            confirmedStars >= 3,
            user?.id,
          )

        queuePendingSync({
          lessonId: authoritativeLessonId || quest.id || questId,
          answers: answersPayload,
          childId: user?.id,
        })

        if (confirmedStars >= 3) {
          quest.status = 'completed'
          setQuest((prev) => (prev ? { ...prev, status: 'completed' } : prev))
          setLiveStars(3)
          setPhase('done')
          const celebrationMsg = isIslandJourney
            ? `Con đã hoàn thành ${quest.title ?? 'bài học'} với 3 Sao!`
            : 'Xuất sắc! Con đạt trọn 3 Sao. Chào mừng Hiệp Sĩ Sáng Tạo AIKI!'
          setCheckResult({
            stars: 3,
            message: celebrationMsg,
            nextQuestId: nextRuleTarget,
          })
          try {
            sessionStorage.removeItem(`aikids_stage_${quest.id}`)
            sessionStorage.removeItem(`aikids_stage_${questId}`)
            if (authoritativeLessonId)
              sessionStorage.removeItem(`aikids_stage_${authoritativeLessonId}`)
          } catch {
            // ignore
          }
          clearApiCache()
          clearWorldPageCache()
          window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
        } else {
          setLiveStars(confirmedStars)
          clearApiCache()
          clearWorldPageCache()
          window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
        }
        void queryClient.invalidateQueries({ queryKey: ['progression'] })
        void queryClient.invalidateQueries({ queryKey: ['pathway'] })
        void queryClient.invalidateQueries({ queryKey: ['course-progress'] })
        return true
      } finally {
        setBusy(false)
      }
    })()
    finishLessonPromiseRef.current = finishPromise
    try {
      return await finishPromise
    } finally {
      if (finishLessonPromiseRef.current === finishPromise) {
        finishLessonPromiseRef.current = null
      }
    }
  }, [
    checkResult,
    quest,
    isAikiRuleJourney,
    ruleId,
    answers,
    authoritativeLessonId,
    questId,
    phase,
    setBusy,
    setError,
    setLiveStars,
    user?.id,
    isIslandJourney,
    setQuest,
    setPhase,
    setCheckResult,
  ])

  const persistJourneyStage = useCallback(
    (stageIndex: number, stageCount: number) => {
      const progressId = authoritativeLessonId || quest?.id || questId
      if (stageCount <= 0) return

      try {
        if (typeof window !== 'undefined') {
          const stageStr = String(stageIndex)
          sessionStorage.setItem(`aikids_stage_${progressId}`, stageStr)
          sessionStorage.setItem(`aikids_stage_${questId}`, stageStr)
          localStorage.setItem(`aikids_lesson_stage_${progressId}`, stageStr)
          localStorage.setItem(`aikids_lesson_stage_${questId}`, stageStr)
          if (stageIndex >= 1) {
            sessionStorage.setItem(`aikids_video_done_${progressId}`, 'true')
            sessionStorage.setItem(`aikids_video_done_${questId}`, 'true')
            localStorage.setItem(`aikids_video_done_${progressId}`, 'true')
            localStorage.setItem(`aikids_video_done_${questId}`, 'true')
          }
          if (authoritativeLessonId) {
            sessionStorage.setItem(`aikids_stage_${authoritativeLessonId}`, stageStr)
            localStorage.setItem(`aikids_lesson_stage_${authoritativeLessonId}`, stageStr)
            if (stageIndex >= 1) {
              sessionStorage.setItem(`aikids_video_done_${authoritativeLessonId}`, 'true')
              localStorage.setItem(`aikids_video_done_${authoritativeLessonId}`, 'true')
            }
          }
        }
      } catch {
        // Storage may be unavailable
      }

      setResumeStageIndex(stageIndex)

      const effectiveLessonIdForResume =
        authoritativeLessonId || quest?.id || progressId || questId

      if (
        phase === 'learn' &&
        stageIndex >= 1 &&
        effectiveLessonIdForResume &&
        !hasAdvancedFromLearnRef.current[effectiveLessonIdForResume]
      ) {
        hasAdvancedFromLearnRef.current[effectiveLessonIdForResume] = true
        void learningApi.advanceLesson(effectiveLessonIdForResume, { fromPhase: 'learn' }).catch(
          () => {
            // Phase may have already advanced or already completed
          },
        )
      }

      if (!navigator.onLine || !effectiveLessonIdForResume) return
      const percent = Math.max(1, Math.min(99, Math.round(((stageIndex + 1) / stageCount) * 100)))
      void learningApi
        .saveResume(effectiveLessonIdForResume, {
          percent,
          positionSeconds: 0,
          sectionId: `stage-${stageIndex + 1}`,
          occurredAt: new Date().toISOString(),
        })
        .catch(() => {
          queueOfflineProgress(effectiveLessonIdForResume, {
            percent,
            positionSeconds: 0,
            sectionId: `stage-${stageIndex + 1}`,
          })
        })
    },
    [authoritativeLessonId, hasAdvancedFromLearnRef, phase, quest?.id, questId, setResumeStageIndex],
  )

  const handleVideoCompleted = useCallback(() => {
    setLiveStars((prev) => Math.max(prev, 1))
    const progressId = authoritativeLessonId || quest?.id || questId
    try {
      if (typeof window !== 'undefined') {
        saveLocalLessonProgress(progressId, 1, false, user?.id)
        if (quest?.id && quest.id !== progressId)
          saveLocalLessonProgress(quest.id, 1, false, user?.id)
        if (questId && questId !== progressId)
          saveLocalLessonProgress(questId, 1, false, user?.id)
        if (authoritativeLessonId && authoritativeLessonId !== progressId)
          saveLocalLessonProgress(authoritativeLessonId, 1, false, user?.id)
        sessionStorage.setItem(`aikids_video_done_${progressId}`, 'true')
        sessionStorage.setItem(`aikids_video_done_${questId}`, 'true')
        localStorage.setItem(`aikids_video_done_${progressId}`, 'true')
        localStorage.setItem(`aikids_video_done_${questId}`, 'true')
        if (authoritativeLessonId) {
          sessionStorage.setItem(`aikids_video_done_${authoritativeLessonId}`, 'true')
          localStorage.setItem(`aikids_video_done_${authoritativeLessonId}`, 'true')
        }
      }
    } catch {
      // ignore
    }

    const effectiveId = authoritativeLessonId || quest?.id || progressId || questId

    if (
      effectiveId &&
      navigator.onLine &&
      phase === 'learn' &&
      !hasAdvancedFromLearnRef.current[effectiveId]
    ) {
      hasAdvancedFromLearnRef.current[effectiveId] = true
      void learningApi
        .advanceLesson(effectiveId, { fromPhase: 'learn' })
        .then(() => {
          clearWorldPageCache()
          clearApiCache()
          window.dispatchEvent(new CustomEvent('aikids:xp-updated', { detail: { stars: 1 } }))
          void queryClient.invalidateQueries({ queryKey: ['pathway'] })
          void queryClient.invalidateQueries({ queryKey: ['course-progress'] })
        })
        .catch(() => null)
    }
  }, [authoritativeLessonId, hasAdvancedFromLearnRef, phase, quest?.id, questId, setLiveStars, user?.id])

  return {
    handleAikiFinish,
    persistJourneyStage,
    handleVideoCompleted,
  }
}
