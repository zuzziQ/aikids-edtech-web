import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Location } from 'react-router'
import {
  isAikiRuleJourney as checkIsAikiRule,
  extractRuleNumber,
  AIKI_MODULE_0_COURSE_ID,
} from '@/features/lesson/lib/rule-journey-identifiers'
import { getAikiStudioConfig } from '@/features/lesson/data/aiki-studio-configs'
import { AIKI_RULES_DATA } from '@/features/rules/data/rules-data'
import type { Gesture } from '@/features/mee-rig/hooks/useMeeCatSpeech'
import { ApiError, type QuestDetail } from '@/shared/lib/api'
import { learningApi } from '@/shared/lib/learning-api'
import { clampStationStars } from '@/shared/lib/star-progress'
import type { GameEvidence } from '@/features/lesson/components/CurriculumGame'
import type { GameHint } from '@/features/lesson/components/games/types'
import type { ZoomImageData } from '@/features/lesson/components/AikiRuleVisuals'
import {
  queueOfflineProgress,
  type OfflineManifest,
} from '@/features/lesson/lib/offline-learning'
import type { Phase } from '@/features/lesson/components/LessonInteractiveSidebar'
import { useAuth } from '@/shared/store/auth'
import { useAikiSituationNarrator } from '@/features/lesson/hooks/useAikiSituationNarrator'
import {
  hydrateAikiRuleCard,
  createAikiRuleCardsFromData,
} from '@/features/lesson/lib/aiki-rule-cards'
import {
  resolveInitialLessonProgress,
  buildRuleQuestDetail,
  buildIslandQuestDetail,
  GEN_KINDS,
  emptyStory,
} from './lesson-state-helpers'
import { useLessonPracticeState } from './useLessonPracticeState'
import { useLessonCheckState } from './useLessonCheckState'
import { useLessonProgression } from './useLessonProgression'

export {
  resolveInitialLessonProgress,
  buildRuleQuestDetail,
  buildIslandQuestDetail,
  GEN_KINDS,
  emptyStory,
}

export interface UseLessonPageStateProps {
  questId: string
  routeCourseId?: string
  location?: Location
}

export function useLessonPageState({ questId, routeCourseId, location }: UseLessonPageStateProps) {
  const [quest, setQuest] = useState<QuestDetail | null>(null)
  const [phase, setPhase] = useState<Phase>('learn')
  const [gameHint, setGameHint] = useState<GameHint | null>(null)
  const [maxUnlockedPhase, setMaxUnlockedPhase] = useState<Phase>('learn')
  const [aikiRuleStage, setAikiRuleStage] = useState(0)
  const [resumeStageIndex, setResumeStageIndex] = useState(0)
  const [aikiQuizAnswer, setAikiQuizAnswer] = useState<number | null>(null)
  const [aikiQuizAnswerCorrect, setAikiQuizAnswerCorrect] = useState(false)
  const [zoomedImage, setZoomedImage] = useState<ZoomImageData | null>(null)
  const [isPosterModalOpen, setIsPosterModalOpen] = useState(false)
  const [hasAcknowledgedRule, setHasAcknowledgedRule] = useState(false)
  const [hasCommitted, setHasCommitted] = useState(false)
  const [videoSeekTarget, setVideoSeekTarget] = useState<{ sec: number; token: number } | null>(null)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false)
  const [isSidebarSpeaking, setIsSidebarSpeaking] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('aikids_lesson_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const toggleSidebarCollapse = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed)
    try {
      localStorage.setItem('aikids_lesson_sidebar_collapsed', String(collapsed))
    } catch {}
  }
  const [isSmallScreen, setIsSmallScreen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1280
    }
    return false
  })

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth < 1280)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [manualMeeCue, setManualMeeCue] = useState<{ key: number; text: string; gesture?: Gesture } | null>(null)
  const {
    isPlaying: isNarratingSituation,
    activeSpeaker,
    speakingLineIndex,
    playSituation,
    stop: stopSituationNarrator,
  } = useAikiSituationNarrator()
  const user = useAuth((s) => s.user)
  const isParent = user?.role === 'parent'
  const [isPaywallOpen, setIsPaywallOpen] = useState(false)
  const [isParentGateOpen, setIsParentGateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [liveStars, setLiveStars] = useState(0)
  const [starBurst, setStarBurst] = useState<{ id: number; count: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [offlineManifest, setOfflineManifest] = useState<OfflineManifest | null>(null)
  // UUID-resolved lesson ID for aiki-rule journeys (prevents 'rule-1' slug reaching Prisma)
  const [authoritativeLessonId, setAuthoritativeLessonId] = useState<string>('')
  const hasAdvancedFromLearnRef = useRef<Record<string, boolean>>({})

  const handleSlideChange = useCallback((index: number) => {
    setAikiRuleStage(index)
  }, [])

  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsVideoPlaying(playing)
  }, [])

  function recoverCurrentPhase(err: unknown): boolean {
    if (!(err instanceof ApiError) || err.status !== 409) return false
    const body = err.body
    if (!body || typeof body !== 'object') return false
    const detail = body as { reason?: unknown; currentPhase?: unknown }
    if (detail.reason !== 'phase_mismatch') return false
    if (
      detail.currentPhase !== 'learn' &&
      detail.currentPhase !== 'game' &&
      detail.currentPhase !== 'practice' &&
      detail.currentPhase !== 'check'
    ) {
      return false
    }
    setPhase(detail.currentPhase)
    setReviewMode(false)
    setError('Bài học vừa được cập nhật. Mình tiếp tục ở phần đang làm nhé!')
    return true
  }

  const isAikiRuleJourney = Boolean(
    checkIsAikiRule(routeCourseId) ||
    checkIsAikiRule(questId) ||
    (quest && (
      checkIsAikiRule(quest.courseId) ||
      checkIsAikiRule(quest.id) ||
      checkIsAikiRule((quest as { slug?: string }).slug) ||
      checkIsAikiRule(quest.title)
    ))
  )

  const isIslandJourney = Boolean(
    !isAikiRuleJourney && (
      quest?.courseId?.startsWith('dao-') ||
      quest?.id?.startsWith('bai-') ||
      questId?.startsWith('bai-') ||
      (quest?.learnCards?.length === 5 && quest.learnCards[0]?.id?.includes('situation'))
    )
  )

  const is5StageJourney = isAikiRuleJourney

  const ruleId = useMemo(() => {
    if (!isAikiRuleJourney) return 0
    return extractRuleNumber(
      quest
        ? { ...quest, courseId: routeCourseId || quest.courseId }
        : questId
    )
  }, [isAikiRuleJourney, questId, quest, routeCourseId])

  const effectiveCourseId = (isAikiRuleJourney && (!routeCourseId || routeCourseId === 'aiki-rules'))
    ? AIKI_MODULE_0_COURSE_ID
    : (routeCourseId || quest?.courseId || (isAikiRuleJourney ? AIKI_MODULE_0_COURSE_ID : '') || 'aiki-rules')

  const ruleData = useMemo(() => {
    if (!isAikiRuleJourney) return null
    return AIKI_RULES_DATA.find((r) => r.id === ruleId) || AIKI_RULES_DATA[0]
  }, [isAikiRuleJourney, ruleId])

  const practice = useLessonPracticeState({
    quest,
    questId,
    setPhase,
    setError,
    setBusy,
    setLiveStars,
    setStarBurst,
    setGameHint,
    recoverCurrentPhase,
  })

  const check = useLessonCheckState({
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
  })

  const progression = useLessonProgression({
    quest,
    setQuest,
    questId,
    authoritativeLessonId,
    phase,
    setPhase,
    setError,
    setBusy,
    setLiveStars,
    checkResult: check.checkResult,
    setCheckResult: check.setCheckResult,
    answers: check.answers,
    isAikiRuleJourney,
    isIslandJourney,
    ruleId,
    hasAdvancedFromLearnRef,
    setResumeStageIndex,
    user,
  })

  const resetLocal = useCallback(() => {
    hasAdvancedFromLearnRef.current = {}
    setPhase('learn')
    setMaxUnlockedPhase('learn')
    setError(null)
    practice.resetPractice()
    check.resetCheck()
    setLiveStars(0)
    setStarBurst(null)
    setReviewMode(false)
    setOfflineManifest(null)
    setQuest(null)
    setAikiRuleStage(0)
    setResumeStageIndex(0)
    setAikiQuizAnswer(null)
    setAikiQuizAnswerCorrect(false)
    setZoomedImage(null)
    setIsPosterModalOpen(false)
    setHasAcknowledgedRule(false)
    setHasCommitted(false)
    setManualMeeCue(null)
  }, [practice.resetPractice, check.resetCheck])

  useEffect(() => {
    setMaxUnlockedPhase((prev) => {
      const phaseOrder = ['learn', 'game', 'practice', 'check', 'done']
      const prevIdx = phaseOrder.indexOf(prev)
      const currentIdx = phaseOrder.indexOf(phase)
      return currentIdx > prevIdx ? phase : prev
    })
  }, [phase])

  // Save resume debounce effect
  useEffect(() => {
    const isLocalCurriculum = questId.startsWith('rule-') || questId.startsWith('bai-') || questId === 'aiki-rules'
    if (!quest || !navigator.onLine || isLocalCurriculum) return
    const percentByPhase: Record<Phase, number> = {
      learn: 10,
      game: 35,
      practice: 65,
      check: 90,
      done: 100,
    }
    const timer = window.setTimeout(() => {
      const occurredAt = new Date().toISOString()
      void learningApi.saveResume(questId, {
        percent: percentByPhase[phase],
        positionSeconds: 0,
        sectionId: phase,
        occurredAt,
      }).catch(() => {
        queueOfflineProgress(questId, {
          percent: percentByPhase[phase],
          positionSeconds: 0,
          sectionId: phase,
        })
      })
    }, 750)
    return () => window.clearTimeout(timer)
  }, [phase, quest, questId])

  const handleSelectOption = useCallback(
    (idx: number) => {
      const targetQuestion = ruleData?.questions?.[0]
      const isCorrect = targetQuestion ? idx === targetQuestion.correctIndex : idx === 1
      setAikiQuizAnswer(idx)
      if (isCorrect) {
        setAikiQuizAnswerCorrect(true)
        setStarBurst({ id: Date.now(), count: 1 })
        setLiveStars((prev) => Math.max(prev, 1))
      }
    },
    [ruleData],
  )

  const hydratedLearnCards = useMemo(() => {
    if (!quest) return []
    if (isAikiRuleJourney && quest.learnCards.length === 0 && ruleData) {
      return createAikiRuleCardsFromData(ruleData)
    }
    return quest.learnCards.map(hydrateAikiRuleCard)
  }, [quest, isAikiRuleJourney, ruleData])

  const visibleLearnCards = useMemo(() => {
    if (is5StageJourney) {
      const card = hydratedLearnCards[aikiRuleStage] || hydratedLearnCards[0]
      return card ? [card] : []
    }
    return hydratedLearnCards
  }, [is5StageJourney, hydratedLearnCards, aikiRuleStage])

  useEffect(() => {
    if (isAikiRuleJourney) return
    if (location?.pathname.endsWith('/studio')) {
      setPhase('practice')
    }
  }, [location?.pathname, isAikiRuleJourney])

  // Safeguard: Aiki rules NEVER enter practice studio
  useEffect(() => {
    if (isAikiRuleJourney && phase === 'practice') {
      setPhase('learn')
    }
  }, [isAikiRuleJourney, phase])

  const studioConfig = useMemo(() => {
    return getAikiStudioConfig(
      (quest as any)?.slug || quest?.id || questId,
      quest?.title,
      (quest as any)?.courseId
    )
  }, [quest, questId])

  const studioCharacterName = useMemo(() => {
    if (studioConfig?.subjectName) return studioConfig.subjectName
    if (
      quest?.title?.toLowerCase().includes('sóc bông') ||
      quest?.hook?.toLowerCase().includes('sóc bông') ||
      questId?.includes('bai-3-2') ||
      quest?.id?.includes('bai-3-2')
    ) {
      return 'Sóc Bông'
    }
    if (quest?.title?.toLowerCase().includes('mèo') || questId?.includes('bai-1')) {
      return 'Mèo Máy'
    }
    if (quest?.title?.toLowerCase().includes('hiệp sĩ') || questId?.includes('bai-2')) {
      return 'Hiệp Sĩ Sáng Tạo'
    }
    return 'Sóc Bông'
  }, [studioConfig, quest?.title, quest?.hook, questId, quest?.id])

  const studioLockedFeatures = useMemo(() => {
    if (studioConfig?.lockedFeatures && studioConfig.lockedFeatures.length > 0) {
      return studioConfig.lockedFeatures
    }
    if (studioCharacterName === 'Sóc Bông') {
      return [
        'mũ len đỏ quả bông trắng',
        'đuôi to xù màu cam',
        'túi vải nâu đeo chéo',
      ]
    }
    if (studioCharacterName === 'Mèo Máy') {
      return [
        'chuông vàng trước cổ',
        'túi thần kỳ trước bụng',
        'đuôi tròn đỏ xinh xắn',
      ]
    }
    return [
      'mũ len đỏ quả bông trắng',
      'đuôi to xù màu cam',
      'túi vải nâu đeo chéo',
    ]
  }, [studioConfig, studioCharacterName])

  useEffect(() => {
    stopSituationNarrator()
  }, [aikiRuleStage, phase, stopSituationNarrator])

  const gameStation = quest?.stations?.stations.find(
    (station) => station.kind === 'game',
  )

  async function advanceFromLearn() {
    const prevPhase = phase
    setError(null)
    const hasGame = quest?.stations?.stations?.some((s) => s.kind === 'game')
    const nextPhase = hasGame ? 'game' : 'practice'
    setPhase(nextPhase)

    try {
      const response = await learningApi.advanceLesson(questId, {
        fromPhase: 'learn',
      })
      if (response?.progress?.phase) {
        setPhase(response.progress.phase)
      }
    } catch (e) {
      if (!recoverCurrentPhase(e)) {
        setPhase(prevPhase)
        setError(e instanceof Error ? e.message : 'Chưa mở được phần chơi')
      }
    }
  }

  async function advanceFromGame(gameEvidence: GameEvidence | { skipped: true }) {
    const prevPhase = phase
    const prevStars = liveStars
    setError(null)
    setPhase('practice')
    setLiveStars((prev) => Math.max(prev, 1))
    setStarBurst({ id: Date.now(), count: 1 })

    try {
      const result = await learningApi.advanceLesson(questId, {
        fromPhase: 'game',
        gameEvidence,
      })
      if (result?.progress?.stars != null) {
        setLiveStars(clampStationStars(result.progress.stars))
      }
      if (result?.progress?.phase) {
        setPhase(result.progress.phase)
      }
    } catch (e) {
      if (!recoverCurrentPhase(e)) {
        setPhase(prevPhase)
        setLiveStars(prevStars)
        setError(e instanceof Error ? e.message : 'Chưa lưu được lượt chơi')
      }
    }
  }

  const currentLearnVideoUrl = quest?.videoUrl || visibleLearnCards[0]?.videoUrl
  const currentLearnVideoTitle = visibleLearnCards[0]?.title || quest?.title

  return {
    quest,
    setQuest,
    phase,
    setPhase,
    gameHint,
    setGameHint,
    maxUnlockedPhase,
    setMaxUnlockedPhase,
    aikiRuleStage,
    setAikiRuleStage,
    resumeStageIndex,
    setResumeStageIndex,
    aikiQuizAnswer,
    setAikiQuizAnswer,
    aikiQuizAnswerCorrect,
    setAikiQuizAnswerCorrect,
    zoomedImage,
    setZoomedImage,
    isPosterModalOpen,
    setIsPosterModalOpen,
    hasAcknowledgedRule,
    setHasAcknowledgedRule,
    hasCommitted,
    setHasCommitted,
    videoSeekTarget,
    setVideoSeekTarget,
    isVideoPlaying,
    setIsVideoPlaying,
    isSidebarSpeaking,
    setIsSidebarSpeaking,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    toggleSidebarCollapse,
    isSmallScreen,
    manualMeeCue,
    setManualMeeCue,
    isNarratingSituation,
    activeSpeaker,
    speakingLineIndex,
    playSituation,
    stopSituationNarrator,
    user,
    isParent,
    isPaywallOpen,
    setIsPaywallOpen,
    isParentGateOpen,
    setIsParentGateOpen,
    error,
    setError,
    loading,
    setLoading,
    parts: practice.parts,
    setParts: practice.setParts,
    generated: practice.generated,
    setGenerated: practice.setGenerated,
    practiceFeedback: practice.practiceFeedback,
    setPracticeFeedback: practice.setPracticeFeedback,
    practiceSaved: practice.practiceSaved,
    setPracticeSaved: practice.setPracticeSaved,
    practiceAdvanced: practice.practiceAdvanced,
    setPracticeAdvanced: practice.setPracticeAdvanced,
    charName: practice.charName,
    setCharName: practice.setCharName,
    charShape: practice.charShape,
    setCharShape: practice.setCharShape,
    charVibe: practice.charVibe,
    setCharVibe: practice.setCharVibe,
    styleId: practice.styleId,
    setStyleId: practice.setStyleId,
    story: practice.story,
    setStory: practice.setStory,
    comicBubbles: practice.comicBubbles,
    setComicBubbles: practice.setComicBubbles,
    detectivePick: practice.detectivePick,
    setDetectivePick: practice.setDetectivePick,
    journalText: practice.journalText,
    setJournalText: practice.setJournalText,
    promptLab: practice.promptLab,
    setPromptLab: practice.setPromptLab,
    paletteColors: practice.paletteColors,
    setPaletteColors: practice.setPaletteColors,
    practiceOrder: practice.practiceOrder,
    setPracticeOrder: practice.setPracticeOrder,
    answers: check.answers,
    setAnswers: check.setAnswers,
    answerFeedback: check.answerFeedback,
    setAnswerFeedback: check.setAnswerFeedback,
    checkingQuestionId: check.checkingQuestionId,
    setCheckingQuestionId: check.setCheckingQuestionId,
    lastActiveQuestionId: check.lastActiveQuestionId,
    setLastActiveQuestionId: check.setLastActiveQuestionId,
    liveStars,
    setLiveStars,
    starBurst,
    setStarBurst,
    checkResult: check.checkResult,
    setCheckResult: check.setCheckResult,
    busy,
    setBusy,
    refAssetIds: practice.refAssetIds,
    setRefAssetIds: practice.setRefAssetIds,
    // lesson assets and sketch: assetIds, sketchDataUrl
    sketchDataUrl: practice.sketchDataUrl,
    setSketchDataUrl: practice.setSketchDataUrl,
    reviewMode,
    setReviewMode,
    offlineManifest,
    setOfflineManifest,
    authoritativeLessonId,
    setAuthoritativeLessonId,
    promptText: practice.promptText,
    isAikiRuleJourney,
    isIslandJourney,
    is5StageJourney,
    ruleId,
    effectiveCourseId,
    ruleData,
    hydratedLearnCards,
    visibleLearnCards,
    studioConfig,
    studioCharacterName,
    studioLockedFeatures,
    panels: practice.panels,
    gameStation,
    practiceStation: practice.practiceStation,
    practiceSteps: practice.practiceSteps,
    practiceCriteria: practice.practiceCriteria,
    orderingCards: practice.orderingCards,
    effectivePracticeOrder: practice.effectivePracticeOrder,
    handleSlideChange,
    handlePlayStateChange,
    resetLocal,
    recoverCurrentPhase,
    handleAikiFinish: progression.handleAikiFinish,
    persistJourneyStage: progression.persistJourneyStage,
    handleVideoCompleted: progression.handleVideoCompleted,
    handleSelectOption,
    selectChip: practice.selectChip,
    practiceReady: practice.practiceReady,
    advanceFromLearn,
    advanceFromGame,
    savePractice: practice.savePractice,
    advanceFromPractice: practice.advanceFromPractice,
    submitCheck: check.submitCheck,
    chooseCheckAnswer: check.chooseCheckAnswer,
    allCheckAnswersCorrect: check.allCheckAnswersCorrect,
    currentLearnVideoUrl,
    currentLearnVideoTitle,
    questId,
    routeCourseId,
    hasAdvancedFromLearnRef,
  }
}
