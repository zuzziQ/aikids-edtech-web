import type { QuestDetail } from '@/shared/lib/api'
import { lessonStageIndexFromProgress } from '@/shared/lib/learning-api'
import { clampStationStars } from '@/shared/lib/star-progress'
import { getStoredItemWithFallback } from '@/shared/lib/learning-sync-store'
import { createAikiRuleCardsFromData } from '@/features/lesson/lib/aiki-rule-cards'

export function resolveInitialLessonProgress(
  openedProgress: any,
  authLessonId: string,
  questId: string,
  childId?: string | null,
) {
  const isLocallyCompleted =
    typeof window !== 'undefined' &&
    (getStoredItemWithFallback(`aikids_lesson_completed_${authLessonId}`, childId) === 'true' ||
      getStoredItemWithFallback(`aikids_lesson_completed_${questId}`, childId) === 'true' ||
      Number(getStoredItemWithFallback(`aikids_lesson_stars_${authLessonId}`, childId) || 0) >= 3 ||
      Number(getStoredItemWithFallback(`aikids_lesson_stars_${questId}`, childId) || 0) >= 3)
  const status = isLocallyCompleted ? 'completed' : openedProgress?.status

  const localStars = Math.max(
    Number(getStoredItemWithFallback(`aikids_lesson_stars_${authLessonId}`, childId) || 0),
    Number(getStoredItemWithFallback(`aikids_lesson_stars_${questId}`, childId) || 0),
    isLocallyCompleted ? 3 : 0,
  )
  const stars = isLocallyCompleted ? 3 : Math.max(localStars, clampStationStars(openedProgress?.stars))
  let cachedLocalStage = 0
  try {
    const raw =
      sessionStorage.getItem(`aikids_stage_${questId}`) ||
      sessionStorage.getItem(`aikids_stage_${authLessonId}`) ||
      localStorage.getItem(`aikids_lesson_stage_${questId}`) ||
      localStorage.getItem(`aikids_lesson_stage_${authLessonId}`)
    const num = raw != null ? parseInt(raw, 10) : 0
    if (Number.isFinite(num) && num > 0) cachedLocalStage = num
  } catch {
    // Storage may be unavailable
  }
  const serverStage = lessonStageIndexFromProgress(openedProgress)
  const resumeStage = isLocallyCompleted ? 99 : Math.max(serverStage, cachedLocalStage)
  return { isLocallyCompleted, status, stars, resumeStage }
}

export function buildRuleQuestDetail(
  authLessonId: string,
  rId: number,
  rData: any,
  status?: string,
): QuestDetail {
  return {
    id: authLessonId,
    status,
    courseId: 'aiki-rules',
    order: rId,
    title: `Quy tắc ${rId}: ${rData.shortTitle}`,
    duration: `${rData.durationSec}s`,
    hook: rData.title,
    goals: [rData.goal],
    learnCards: createAikiRuleCardsFromData(rData),
    stations: { stations: [] },
    practiceKind: 'chips',
    check: rData.questions.map((q: any) => ({
      id: String(q.id),
      question: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.successFeedback || q.hint || 'Quy tắc vàng AIKI',
    })),
  } as any
}

export function buildIslandQuestDetail(
  authLessonId: string,
  questId: string,
  islandCurriculum: any,
  routeCourseId?: string,
  status?: string,
): QuestDetail {
  return {
    id: authLessonId,
    slug: questId,
    status,
    courseId:
      islandCurriculum.courseId ||
      (routeCourseId && !routeCourseId.startsWith('dao-')
        ? routeCourseId
        : `dao-${islandCurriculum.islandNumber}`),
    order: islandCurriculum.lessonNumber || 1,
    title: islandCurriculum.title,
    duration: '180s',
    hook: islandCurriculum.journey.stage1_goal.title,
    goals: [
      islandCurriculum.journey.stage1_goal.coreGoal ||
        islandCurriculum.journey.stage1_goal.goalText ||
        islandCurriculum.objective,
    ],
    learnCards: [],
    stations: { stations: [] },
    practiceKind: 'chips',
    sixStageJourney: islandCurriculum.journey,
    check: islandCurriculum.journey.stage4_quiz.questions.map((q: any, idx: number) => ({
      id: String(idx + 1),
      question: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || 'Quy tắc vàng AIKI',
    })),
  } as any
}

// These workshops can continue from course-created work only; the API verifies ownership.
export const GEN_KINDS = new Set(['ai_pick', 'video', 'chips', 'character'])

export const emptyStory = {
  opening: '',
  problem: '',
  ending: '',
  title: 'Truyện của con',
}
