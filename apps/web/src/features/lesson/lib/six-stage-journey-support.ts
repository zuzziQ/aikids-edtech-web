import type { LessonSixStageJourney } from '@/shared/lib/api'
import type { JourneyStageDefinition } from '../types/stage-schema'
import type { LearnCardDraft, StageBlockItem } from '@/features/teacher/lib/authoring'
import { isAikiRuleJourney, extractRuleNumber } from '../lib/rule-journey-identifiers'
export type LessonCompletionSummary = {
  stars: number
  xp: number
  nextLessonSlug?: string
  answers?: Array<{ questionId: string; optionIndex: number }>
  keepalive?: boolean
  practicePromise?: Promise<any>
}

export interface UseSixStageJourneyStateProps {
  journey?: LessonSixStageJourney
  stages?: JourneyStageDefinition[]
  lessonId: string
  lessonTitle: string
  studentStars?: number
  rewardXp?: number
  isCompleted?: boolean
  previousStars?: number
  onFinishLesson?: (result: LessonCompletionSummary) => boolean | void | Promise<boolean | void>
  onBackToMap?: () => void
  onNavigateNextLesson?: (nextLessonSlug: string) => void
  onOpenCourse?: () => void
  initialStageIndex?: number
  onStageChange?: (stageIndex: number) => void
  isFinalStation?: boolean
  matchedCurriculum?: {
    lessonNumber?: string
    islandNumber: number
    islandName?: string
    title: string
    journey?: Partial<LessonSixStageJourney>
  }
  onVideoCompleted?: () => void
  isSavingProgress?: boolean
  initialPracticeState?: any
  onPracticeStateChange?: (state: any) => void
}

/**
 * Quy đổi thống nhất Sao sang XP cho toàn bộ trạm học AIKids:
 * - 1 Sao = 30 XP
 * - 2 Sao = 60 XP
 * - 3 Sao = 100 XP (kèm 10 XP Mastery Bonus)
 */
export function calculateStationXp(stars: number): number {
  if (stars >= 3) return 100
  if (stars === 2) return 60
  if (stars === 1) return 30
  return 0
}

export function readLessonStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key)
    if (raw == null) return fallback
    if (typeof fallback === 'number') {
      const parsed = parseInt(raw, 10)
      return (Number.isFinite(parsed) ? parsed : fallback) as T
    }
    if (typeof fallback === 'boolean') {
      return (raw === 'true') as T
    }
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeLessonStorage(key: string, value: unknown): void {
  try {
    if (typeof window === 'undefined') return
    const str = typeof value === 'string' ? value : JSON.stringify(value)
    sessionStorage.setItem(key, str)
    localStorage.setItem(key, str)
  } catch {
    // Storage may be unavailable
  }
}

export function parseQuizAnswersStorage(lessonId: string): Record<number, number> {
  const raw = readLessonStorage<unknown>(`aikids_quiz_ans_${lessonId}`, {})
  const map: Record<number, number> = {}
  if (Array.isArray(raw)) {
    raw.forEach((item, idx) => {
      if (typeof item === 'number') {
        map[idx] = item
      } else if (item && typeof item === 'object' && typeof (item as any).optionIndex === 'number' && (item as any).optionIndex >= 0) {
        map[idx] = (item as any).optionIndex
      }
    })
    return map
  }
  if (raw && typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
      if (typeof v === 'number') {
        map[Number(k)] = v
      } else if (v && typeof v === 'object' && typeof (v as any).optionIndex === 'number') {
        map[Number(k)] = (v as any).optionIndex
      }
    })
    return map
  }
  return {}
}

export function clearLessonStageStorage(lessonId: string): void {
  try {
    if (typeof window === 'undefined') return
    const keys = [
      `aikids_lesson_stage_${lessonId}`,
      `aikids_lesson_completed_stages_${lessonId}`,
      `aikids_stage_${lessonId}`,
      `aikids_quiz_ans_${lessonId}`,
      `aikids_quiz_chk_${lessonId}`,
      `aikids_quiz_active_${lessonId}`,
      `aikids_quiz_sub_${lessonId}`,
      `aikids_video_done_${lessonId}`,
      `aikids_lesson_stars_${lessonId}`,
      `aikids_confirm_opt_${lessonId}`,
      `aikids_confirm_cor_${lessonId}`,
      `aikids_practice_done_${lessonId}`,
    ]
    for (const k of keys) {
      sessionStorage.removeItem(k)
      localStorage.removeItem(k)
    }
  } catch {
    // Storage may be unavailable
  }
}


type MatchedCurriculum = NonNullable<UseSixStageJourneyStateProps['matchedCurriculum']>

/** Curriculum match from props, else parsed from a `bai-<island>-<lesson>` id/title. */
export function resolveMatchedCurriculum(
  matchedCurriculumProp: MatchedCurriculum | undefined,
  lessonId: string,
  lessonTitle: string,
  journey: LessonSixStageJourney,
): MatchedCurriculum | undefined {
  if (matchedCurriculumProp) return matchedCurriculumProp
  const match = `${lessonId} ${lessonTitle}`.match(/(?:bai[-_]|bài\s+)(\d+)[-_.\s]+(\d+)/i)
  if (!match) return undefined
  return {
    islandNumber: Number(match[1]),
    lessonNumber: `${match[1]}.${match[2]}`,
    title: lessonTitle,
    journey,
  }
}

export function resolveStationInfo(
  matchedCurriculum: MatchedCurriculum | undefined,
  lessonId: string,
  lessonTitle: string,
  stagesProp: JourneyStageDefinition[] | undefined,
): { stationLabel: string; islandName: string; lessonNumber: string } {
  const curriculum = matchedCurriculum
  const cleanCurriculumTitle = (rawTitle: string) => {
    return (rawTitle || '')
      .replace(/^Bài\s+[\d.]+\s*[-—:]\s*/i, '')
      .replace(/^Trạm\s+[\d.]+\s*[-—:]\s*/i, '')
      .trim()
  }

  const ISLAND_CANONICAL_NAMES: Record<number, string> = {
    0: 'Đảo Tiên Quyết',
    1: 'Đảo 1: Nhà Thám Hiểm AI',
    2: 'Đảo 2: Hoạ Sĩ AI',
    3: 'Đảo 3: Biệt Đội Nhân Vật',
    4: 'Đảo 4: Vương Quốc Truyện Tranh',
    5: 'Đảo 5: Đấu Trường Trò Chơi',
    6: 'Đảo 6: Triển Lãm & Tốt Nghiệp',
  }

  if (curriculum) {
    const num = String(curriculum.lessonNumber || '1.1')
    const pureTitle = cleanCurriculumTitle(curriculum.title)
    const parts = num.split('.')
    const stationOrderNum = parts.length > 1 ? parts[1] : num
    const stationLabel = pureTitle.startsWith('Trạm')
      ? pureTitle
      : `Trạm ${stationOrderNum} — ${pureTitle}`

    return {
      stationLabel,
      islandName: ISLAND_CANONICAL_NAMES[curriculum.islandNumber] || (curriculum as any).islandName || `Đảo ${curriculum.islandNumber}`,
      lessonNumber: num,
    }
  }

  if (isAikiRuleJourney(lessonId) || isAikiRuleJourney(lessonTitle)) {
    const rNum = extractRuleNumber({ id: lessonId, title: lessonTitle })
    const ruleStageTitle = String(stagesProp?.[0]?.title || '')
    return {
      stationLabel: ruleStageTitle ? `Quy tắc ${rNum}: ${ruleStageTitle}` : lessonTitle || `Quy tắc ${rNum}`,
      islandName: 'Xưởng Sáng Tạo — 10 Quy Tắc Vàng',
      lessonNumber: String(rNum),
    }
  }

  const safeTitle = cleanCurriculumTitle(lessonTitle || 'Bài học')
  return {
    stationLabel: safeTitle.startsWith('Trạm') ? safeTitle : `Trạm — ${safeTitle}`,
    islandName: 'Đảo Sáng Tạo',
    lessonNumber: '1',
  }
}

/** Only the last station of a programme (rule 10, lesson 5.5) awards the graduation certificate. */
export function resolveIsFinalStation(
  isFinalStationProp: boolean | undefined,
  isRuleLesson: boolean,
  lessonId: string,
  lessonTitle: string,
  matchedCurriculum: MatchedCurriculum | undefined,
): boolean {
  if (typeof isFinalStationProp === 'boolean') return isFinalStationProp
  if (isRuleLesson) return extractRuleNumber({ id: lessonId, title: lessonTitle }) === 10
  if (matchedCurriculum) return String(matchedCurriculum.lessonNumber || '') === '5.5'
  return false
}

/** Extra authored blocks for the current stage, minus the ones the stage renderer already shows. */
export function buildSupplementalStageCard(
  stageContentBlocks: LessonSixStageJourney['stageContentBlocks'],
  currentStage: number,
  stageTitle: string | undefined,
): LearnCardDraft | null {
  const blocks = (stageContentBlocks?.[`stage-${currentStage}`] as StageBlockItem[] | undefined)
    ?.filter((block) => {
      if (block.id.startsWith('course-goal-')) return false
      if (block.id.startsWith('course-confirm-')) return false
      if (block.id.startsWith('course-video-')) return false
      if (block.id.startsWith('course-quiz-')) return false
      if (block.id.startsWith('course-practice-')) return false
      if (block.id.startsWith('course-reward-')) return false
      if (currentStage === 1 && (block.type === 'layout-confirm-option' || block.type === 'quiz-question' || block.id.startsWith('blk-quiz-'))) return false
      if (currentStage === 2 && block.type === 'video') return false
      if (currentStage === 3 && (block.type === 'quiz-question' || block.type === 'layout-confirm-option' || block.id.startsWith('blk-quiz-'))) return false
      if (currentStage === 4 && block.type === 'practice') return false
      if (currentStage === 5 && block.type === 'reward') return false
      return true
    })
  if (!Array.isArray(blocks) || blocks.length === 0) return null

  return {
    id: `island-stage-${currentStage + 1}`,
    title: stageTitle || `Chặng ${currentStage + 1}`,
    body: '',
    tip: '',
    kind: currentStage === 0 ? 'concept' : 'example',
    layout: 'text',
    visualItems: [],
    contentBlocks: blocks,
    mee: { readText: '', gesture: 'presentation', autoRead: false },
  }
}
