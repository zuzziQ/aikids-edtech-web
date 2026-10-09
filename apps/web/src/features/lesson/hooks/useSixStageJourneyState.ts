import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { quizStarsFromScore } from '../lib/quiz-stars'
import type { LessonSixStageJourney } from '@/shared/lib/api'
import { learningApi } from '@/shared/lib/learning-api'
import {
  type StudioImageItem,
  type PracticePartState,
} from '../lib/practice-parts'
import { playInstantSound } from '../components/LessonInteractiveSidebar'
import { normalizeVietnameseSpeech } from '@/shared/lib/vietnameseSpeech'
import { isAikiRuleJourney, extractRuleNumber } from '../lib/rule-journey-identifiers'
import type { JourneyStageDefinition, RewardStageConfig } from '../types/stage-schema'
import { calculateUniversalStars, getStageTypeIndices } from '../lib/universal-stage-engine'
import { useAuth } from '@/shared/store/auth'
import { saveLocalLessonProgress } from '@/shared/lib/learning-sync-store'
import { clearWorldPageCache } from '@/features/world/lib/world-pathway-mapper'

import {
  calculateStationXp,
  clearLessonStageStorage,
  readLessonStorage,
  writeLessonStorage,
  parseQuizAnswersStorage,
  resolveMatchedCurriculum,
  resolveStationInfo,
  resolveIsFinalStation,
  buildSupplementalStageCard,
  type LessonCompletionSummary,
  type UseSixStageJourneyStateProps,
} from '../lib/six-stage-journey-support'
import { useLessonImageZoom } from './useLessonImageZoom'

// Moved for the 800-line guard; re-exported so existing imports keep working.
export {
  calculateStationXp,
  readLessonStorage,
  writeLessonStorage,
  parseQuizAnswersStorage,
  clearLessonStageStorage,
} from '../lib/six-stage-journey-support'
export type { LessonCompletionSummary, UseSixStageJourneyStateProps } from '../lib/six-stage-journey-support'
export function useSixStageJourneyState({
  journey: rawJourney,
  stages: stagesProp,
  lessonId,
  lessonTitle,
  studentStars = 42,
  rewardXp: rewardXpProp,
  isCompleted = false,
  previousStars,
  onFinishLesson,
  onBackToMap,
  onNavigateNextLesson,
  onOpenCourse,
  initialStageIndex = 0,
  onStageChange,
  isFinalStation: isFinalStationProp,
  matchedCurriculum: matchedCurriculumProp,
  onVideoCompleted: onVideoCompletedProp,
  isSavingProgress: _isSavingProgress = false,
  initialPracticeState,
  onPracticeStateChange: onPracticeStateChangeProp,
}: UseSixStageJourneyStateProps) {
  const journey = rawJourney as LessonSixStageJourney
  const user = useAuth((s) => s.user)
  const currentChildId = user?.id

  const matchedCurriculum = useMemo(
    () => resolveMatchedCurriculum(matchedCurriculumProp, lessonId, lessonTitle, journey),
    [journey, lessonId, lessonTitle, matchedCurriculumProp],
  )

  const isRuleLesson = useMemo(
    () => isAikiRuleJourney(lessonId) || isAikiRuleJourney(lessonTitle) || isAikiRuleJourney(journey),
    [journey, lessonId, lessonTitle],
  )

  const stationInfo = useMemo(
    () => resolveStationInfo(matchedCurriculum, lessonId, lessonTitle, stagesProp),
    [matchedCurriculum, lessonId, lessonTitle, stagesProp],
  )

  const stages = useMemo(() => stagesProp || [], [stagesProp])
  const indices = useMemo(() => getStageTypeIndices(stages), [stages])

  const isFinalStation = useMemo(
    () => resolveIsFinalStation(isFinalStationProp, isRuleLesson, lessonId, lessonTitle, matchedCurriculum),
    [isFinalStationProp, isRuleLesson, lessonId, lessonTitle, matchedCurriculum],
  )

  const isCompletedLesson = Boolean(isCompleted || (previousStars != null && previousStars >= 3))

  const [currentStage, setCurrentStage] = useState<number>(() => {
    const maxIdx = Math.max(0, stages.length - 1)
    if (isCompletedLesson) {
      return Math.max(0, Math.min(initialStageIndex > 0 ? initialStageIndex : maxIdx, maxIdx))
    }
    const savedRaw = readLessonStorage<number>(`aikids_stage_${lessonId}`, 0)
    const maxLocalStage = Math.max(0, maxIdx - 1)
    const savedStage = Math.min(savedRaw, maxLocalStage)
    const effectiveInitial = initialStageIndex > 0 ? initialStageIndex : savedStage
    return Math.max(0, Math.min(effectiveInitial, maxIdx))
  })

  const [completedStages, setCompletedStages] = useState<Set<number>>(() => {
    const set = new Set<number>()
    const maxIdx = Math.max(0, stages.length - 1)
    if (isCompletedLesson) {
      for (let i = 0; i <= maxIdx; i++) set.add(i)
      return set
    }
    const savedRaw = readLessonStorage<number>(`aikids_stage_${lessonId}`, 0)
    const maxLocalStage = Math.max(0, maxIdx - 1)
    const savedStage = Math.min(savedRaw, maxLocalStage)
    const effectiveInitial = initialStageIndex > 0 ? initialStageIndex : savedStage
    const init = Math.max(0, Math.min(effectiveInitial, maxIdx))
    for (let i = 0; i < init; i++) set.add(i)
    const isSavedDone = readLessonStorage<boolean>(`aikids_video_done_${lessonId}`, false)
    const videoIdx = stages.findIndex((s) => s.type === 'VIDEO')
    const isVideoPassed = videoIdx >= 0 ? (init > videoIdx) : (init > 0)
    if (isSavedDone || isVideoPassed) {
      set.add(0)
    }
    return set
  })

  const prevStageRef = useRef(currentStage)
  const prevLessonIdRef = useRef(lessonId)
  const hasAutoFinishedRef = useRef(false)
  const hasInitializedCompletedRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.removeItem(`aikids_lesson_stage_${lessonId}`)
      localStorage.removeItem(`aikids_lesson_completed_stages_${lessonId}`)
    } catch {
      // Storage may be unavailable
    }
  }, [lessonId])

  useEffect(() => {
    if (prevStageRef.current !== currentStage) {
      prevStageRef.current = currentStage
    }
  }, [currentStage])

  // Stage 1 (Confirm goal) state
  const [selectedConfirmOption, setSelectedConfirmOption] = useState<number | null>(() =>
    readLessonStorage<number | null>(`aikids_confirm_opt_${lessonId}`, null),
  )
  const [isConfirmCorrect, setIsConfirmCorrect] = useState<boolean | null>(() =>
    readLessonStorage<boolean | null>(`aikids_confirm_cor_${lessonId}`, null),
  )
  const [failedOptionImages, setFailedOptionImages] = useState<Record<string, boolean>>({})

  // Stage 2 (Video) seek & completion state
  const [videoSeekSec, setVideoSeekSec] = useState<number | null>(null)
  const [isVideoCompleted, setIsVideoCompleted] = useState<boolean>(() => {
    const isSavedDone = readLessonStorage<boolean>(`aikids_video_done_${lessonId}`, false)
    const savedStage = readLessonStorage<number>(`aikids_lesson_stage_${lessonId}`, 0)
      || readLessonStorage<number>(`aikids_stage_${lessonId}`, 0)
    const init = Math.max(initialStageIndex, savedStage)
    const videoIdx = stages.findIndex((s) => s.type === 'VIDEO')
    const isVideoPassed = videoIdx >= 0 ? (init > videoIdx) : (init > 0)
    return isSavedDone || isVideoPassed
  })

  // The authoritative resume checkpoint arrives with the async lesson-open
  // response. Apply a newer server checkpoint without ever moving a learner
  // backwards if they already advanced while the request was in flight.
  useEffect(() => {
    const maxIdx = Math.max(0, stages.length - 1)
    if (isCompletedLesson) {
      setCompletedStages((prev) => {
        const next = new Set(prev)
        for (let i = 0; i <= maxIdx; i++) next.add(i)
        return next
      })
      setIsVideoCompleted(true)
      if (!hasInitializedCompletedRef.current) {
        hasInitializedCompletedRef.current = true
        const targetStage = Math.max(0, Math.min(initialStageIndex > 0 ? initialStageIndex : maxIdx, maxIdx))
        setCurrentStage(targetStage)
      }
      return
    }
    const resumedStage = Math.max(
      0,
      Math.min(initialStageIndex, maxIdx),
    )
    if (resumedStage > 0) {
      setCompletedStages((prev) => {
        const next = new Set(prev)
        for (let i = 0; i < resumedStage; i++) {
          next.add(i)
        }
        return next
      })
      const videoIdx = stages.findIndex((s) => s.type === 'VIDEO')
      const isVideoPassed = videoIdx >= 0 ? (resumedStage > videoIdx) : (resumedStage > 0)
      if (isVideoPassed) {
        setIsVideoCompleted(true)
      }
      const quizIdx = stages.findIndex((s) => s.type === 'QUIZ')
      if (quizIdx >= 0 && resumedStage > quizIdx) {
        const currentStored = readLessonStorage<number>(`aikids_lesson_stars_${lessonId}`, 0)
        if (currentStored < 2) {
          writeLessonStorage(`aikids_lesson_stars_${lessonId}`, 2)
          saveLocalLessonProgress(lessonId, 2, false, currentChildId)
          if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
            saveLocalLessonProgress((matchedCurriculum as any).id, 2, false, currentChildId)
          }
          if ((matchedCurriculum as any)?.slug && (matchedCurriculum as any).slug !== lessonId) {
            saveLocalLessonProgress((matchedCurriculum as any).slug, 2, false, currentChildId)
          }
          if (matchedCurriculum?.lessonNumber) {
            saveLocalLessonProgress(matchedCurriculum.lessonNumber, 2, false, currentChildId)
          }
          clearWorldPageCache()
        }
      }
    }
    setCurrentStage((current) => Math.max(current, resumedStage))
  }, [initialStageIndex, stages.length, lessonId, isCompletedLesson, stages, currentChildId, matchedCurriculum])

  const hasNotifiedVideoDoneRef = useRef(false)
  useEffect(() => {
    if (isVideoCompleted && !hasNotifiedVideoDoneRef.current) {
      hasNotifiedVideoDoneRef.current = true
      onVideoCompletedProp?.()
    }
  }, [isVideoCompleted, onVideoCompletedProp])

  // Stage 3 (Quiz) state - khôi phục 100% khi thoát ra vào lại
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>(() =>
    parseQuizAnswersStorage(lessonId),
  )
  const [quizSubmitted, setQuizSubmitted] = useState<boolean>(() =>
    readLessonStorage<boolean>(`aikids_quiz_sub_${lessonId}`, false),
  )
  const [activeQuizQuestionIdx, setActiveQuizQuestionIdx] = useState<number>(() =>
    readLessonStorage<number>(`aikids_quiz_active_${lessonId}`, 0),
  )
  const [checkedQuestions, setCheckedQuestions] = useState<Record<number, boolean>>(() =>
    readLessonStorage<Record<number, boolean>>(`aikids_quiz_chk_${lessonId}`, {}),
  )
  const [failedQuizImages, setFailedQuizImages] = useState<Record<number, boolean>>({})
  const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false)

  // Stage 4 (Practice) submitted artwork state
  const [isPracticeCompleted, setIsPracticeCompleted] = useState<boolean>(() => {
    return readLessonStorage<boolean>(`aikids_practice_done_${lessonId}`, false)
  })
  const [submittedArtwork, setSubmittedArtwork] = useState<{
    image: StudioImageItem
    prompt: string
  } | null>(null)

  // Stage 4 (Practice) parts state
  const [activePracticePartIndex, setActivePracticePartIndex] = useState<number>(0)
  const [practicePartsState, setPracticePartsState] = useState<PracticePartState[]>([])

  const {
    zoomImage,
    setZoomImage,
    modalImgSrc,
    zoomScale,
    setZoomScale,
    isFullscreen,
    modalRef,
    toggleFullscreen,
    handleModalImgError,
    handleCloseModal,
  } = useLessonImageZoom()
  const handleStageSelect = useCallback(
    (index: number) => {
      setCurrentStage(index)
      writeLessonStorage(`aikids_stage_${lessonId}`, String(index))
      writeLessonStorage(`aikids_lesson_stage_${lessonId}`, index)
      onStageChange?.(index)
    },
    [lessonId, onStageChange],
  )

  const quizStageDef = stages.find((s) => s.type === 'QUIZ')
  const rewardStageDef = stages.find((s) => s.type === 'REWARD')
  const rewardXp = rewardXpProp || rewardStageDef?.config?.rewardBadge?.xp || journey?.stage6_completion?.rewardBadge?.xp || 50
  const effectiveQuizQuestions = (quizStageDef?.config?.questions as any[]) || journey?.stage4_quiz?.questions || []
  const submittedQuizAnswers = useMemo(
    () => effectiveQuizQuestions.map((question, index) => ({
      questionId: String(question.id || `${lessonId}-check-${index + 1}`),
      optionIndex: typeof quizAnswers[index] === 'number' ? quizAnswers[index] : -1,
    })),
    [effectiveQuizQuestions, lessonId, quizAnswers],
  )

  const advanceToStage = useCallback(
    (nextStage: number) => {
      const videoIdx = stages.findIndex((s) => s.type === 'VIDEO')
      if (stages[currentStage]?.type === 'VIDEO' || (videoIdx >= 0 && currentStage === videoIdx)) {
        setIsVideoCompleted(true)
        writeLessonStorage(`aikids_video_done_${lessonId}`, true)
        writeLessonStorage(`aikids_lesson_stars_${lessonId}`, 1)
        saveLocalLessonProgress(lessonId, 1, false, currentChildId)
        if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
          saveLocalLessonProgress((matchedCurriculum as any).id, 1, false, currentChildId)
        }
        onVideoCompletedProp?.()
      }
      setCompletedStages((prev) => {
        return new Set([...prev, currentStage])
      })
      setCurrentStage(nextStage)
      writeLessonStorage(`aikids_stage_${lessonId}`, String(nextStage))
      writeLessonStorage(`aikids_lesson_stage_${lessonId}`, nextStage)
      onStageChange?.(nextStage)

      if (!hasAutoFinishedRef.current && (stages[nextStage]?.type === 'REWARD' || nextStage === stages.length - 1)) {
        hasAutoFinishedRef.current = true
        // Tự động lưu hoàn thành bài học ngay khi học sinh chạm tới chặng Thưởng
        const hasPractice = indices.practiceIdx >= 0
        const practiceDone = Boolean(submittedArtwork) || completedStages.has(indices.practiceIdx) || isPracticeCompleted
        const targetStars = (hasPractice && !practiceDone) ? 2 : 3
        const completionSummary: LessonCompletionSummary = {
          stars: targetStars,
          xp: targetStars >= 3 ? (rewardXp || 50) : calculateStationXp(targetStars),
          answers: submittedQuizAnswers,
          nextLessonSlug: (stages[nextStage]?.config as any)?.nextLessonSlug,
        }
        void onFinishLesson?.(completionSummary)
      }

      try {
        playInstantSound('click')
      } catch {
        // ignore audio failure
      }
    },
    [completedStages, currentChildId, currentStage, indices.practiceIdx, isPracticeCompleted, lessonId, matchedCurriculum, onFinishLesson, onStageChange, onVideoCompletedProp, rewardXp, stages, submittedArtwork, submittedQuizAnswers],
  )

  const handleRetryQuestion = useCallback((qIdx: number) => {
    setCheckedQuestions((prev) => {
      const updated = { ...prev }
      delete updated[qIdx]
      writeLessonStorage(`aikids_quiz_chk_${lessonId}`, updated)
      return updated
    })
    setQuizAnswers((prev) => {
      const updated = { ...prev }
      delete updated[qIdx]
      writeLessonStorage(`aikids_quiz_ans_${lessonId}`, updated)
      return updated
    })
    try {
      playInstantSound('click')
    } catch {
      // ignore
    }
  }, [lessonId])

  const handleSeekVideo = useCallback((sec: number) => {
    setVideoSeekSec(sec)
    try {
      playInstantSound('click')
    } catch {
      // ignore
    }
  }, [])

  // Web Speech synthesis for AIKI
  const speakCurrentStage = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const cleaned = normalizeVietnameseSpeech(text)
      if (!cleaned) return
      const utterance = new SpeechSynthesisUtterance(cleaned)
      utterance.lang = 'vi-VN'
      utterance.rate = 0.95
      window.speechSynthesis.speak(utterance)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [currentStage, lessonId])

  // Reset local journey state or restore persisted state if lessonId changes on the same instance
  useEffect(() => {
    if (prevLessonIdRef.current !== lessonId) {
      prevLessonIdRef.current = lessonId
      hasInitializedCompletedRef.current = false
      const resumed = Math.max(0, Math.min(initialStageIndex, Math.max(0, stages.length - 1)))
      setCurrentStage(resumed)
      const set = new Set<number>()
      for (let i = 0; i < resumed; i++) set.add(i)
      setCompletedStages(set)
      const isSavedDone = readLessonStorage<boolean>(`aikids_video_done_${lessonId}`, false)
      const videoIdx = stages.findIndex((s) => s.type === 'VIDEO')
      const isVideoPassed = videoIdx >= 0 ? (resumed > videoIdx) : (resumed > 0)
      setIsVideoCompleted(isSavedDone || isVideoPassed)
      setSelectedConfirmOption(readLessonStorage<number | null>(`aikids_confirm_opt_${lessonId}`, null))
      setIsConfirmCorrect(readLessonStorage<boolean | null>(`aikids_confirm_cor_${lessonId}`, null))
      setFailedOptionImages({})
      setVideoSeekSec(null)
      setQuizAnswers(parseQuizAnswersStorage(lessonId))
      setQuizSubmitted(readLessonStorage<boolean>(`aikids_quiz_sub_${lessonId}`, false))
      setActiveQuizQuestionIdx(readLessonStorage<number>(`aikids_quiz_active_${lessonId}`, 0))
      setCheckedQuestions(readLessonStorage<Record<number, boolean>>(`aikids_quiz_chk_${lessonId}`, {}))
      setFailedQuizImages({})
      setIsCertificateModalOpen(false)
      setSubmittedArtwork(null)
      setIsPracticeCompleted(readLessonStorage<boolean>(`aikids_practice_done_${lessonId}`, false))
      setActivePracticePartIndex(0)
      setPracticePartsState([])
      setZoomImage(null)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel()
        } catch {
          // ignore
        }
      }
    }
  }, [lessonId, initialStageIndex, stages.length, stages])

  const currentStageDef = stages[currentStage] || stages[0]

  // Calculate Quiz Score
  const quizScore = useMemo(() => {
    let correct = 0
    effectiveQuizQuestions.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correctIndex) {
        correct++
      }
    })
    return correct
  }, [effectiveQuizQuestions, quizAnswers])

  const quizStars = useMemo(
    () => quizStarsFromScore(quizScore, effectiveQuizQuestions.length || 1),
    [quizScore, effectiveQuizQuestions],
  )

  const isReplay = Boolean(isCompleted || (previousStars != null && previousStars > 0))
  const defaultStars = rewardStageDef?.config?.rewardBadge?.stars ?? journey?.stage6_completion?.rewardBadge?.stars ?? 3

  const earnedStars = useMemo(() => {
    return calculateUniversalStars({
      stages,
      currentStage,
      completedStages,
      isVideoCompleted,
      quizScore,
      effectiveQuizQuestions,
      quizSubmitted,
      submittedArtwork,
      isCompletedLesson,
      previousStars,
      defaultStars,
      isPracticeCompleted,
    })
  }, [
    stages,
    currentStage,
    completedStages,
    isVideoCompleted,
    quizScore,
    effectiveQuizQuestions,
    quizSubmitted,
    submittedArtwork,
    isCompletedLesson,
    previousStars,
    defaultStars,
    isPracticeCompleted,
  ])

  const calculatedXp = rewardXpProp ?? rewardStageDef?.config?.rewardBadge?.xp ?? journey?.stage6_completion?.rewardBadge?.xp ?? calculateStationXp(earnedStars)
  const effectiveStars = earnedStars
  const effectiveRewardXp = isReplay ? 0 : calculatedXp
  const previousEarnedStarsRef = useRef(earnedStars)
  const [starCelebration, setStarCelebration] = useState(0)

  useEffect(() => {
    const previousStarsCount = previousEarnedStarsRef.current
    previousEarnedStarsRef.current = earnedStars
    if (isReplay || earnedStars <= previousStarsCount) return

    setStarCelebration((sequence) => sequence + 1)
    try {
      playInstantSound('star')
    } catch {
      // Animation remains visible when browser audio is unavailable.
    }

    const timer = window.setTimeout(() => setStarCelebration(0), 1800)
    return () => window.clearTimeout(timer)
  }, [earnedStars, isReplay])

  // Tự động lưu tiến trình và thông báo mở khóa ngay khi tới bước hoàn thành (REWARD)
  useEffect(() => {
    if ((currentStageDef?.type === 'REWARD' || currentStage === stages.length - 1) && !hasAutoFinishedRef.current) {
      hasAutoFinishedRef.current = true
      // Completion and rewards are persisted only after the owning LMS
      // endpoint verifies the submitted evidence. Browser storage must not
      // mint stars, XP or unlock the next lesson.
      const hasPractice = indices.practiceIdx >= 0
      const practiceDone = Boolean(submittedArtwork) || completedStages.has(indices.practiceIdx) || isPracticeCompleted
      const targetStars = (hasPractice && !practiceDone) ? effectiveStars : 3
      Promise.resolve(
        onFinishLesson?.({
          stars: targetStars,
          xp: targetStars >= 3 ? (effectiveRewardXp || rewardXp || 50) : (effectiveRewardXp || calculateStationXp(targetStars)),
          nextLessonSlug: (currentStageDef?.config as any)?.nextLessonSlug,
          answers: submittedQuizAnswers,
        }),
      ).then((res) => {
        if (res !== false && targetStars >= 3) {
          clearLessonStageStorage(lessonId)
        }
      })
    }
  }, [currentStage, currentStageDef, effectiveRewardXp, isRuleLesson, lessonId, lessonTitle, onFinishLesson, rewardXp, stages.length, submittedQuizAnswers, indices.practiceIdx, submittedArtwork, completedStages, isPracticeCompleted, effectiveStars])

  const supplementalStageCard = useMemo(
    () => buildSupplementalStageCard(journey?.stageContentBlocks, currentStage, stages[currentStage]?.title),
    [currentStage, journey?.stageContentBlocks, stages],
  )

  const legacyStationAlias = useMemo(() => {
    if (stationInfo.lessonNumber === '1.1') return 'Trạm 1: Mèo AIKI'
    if (stationInfo.lessonNumber === '1.2') return 'Trạm 2: 4 Chìa Khoá'
    return ''
  }, [stationInfo.lessonNumber])

  // Confirm Option Handler
  const handleSelectConfirmOption = useCallback((idx: number) => {
    setSelectedConfirmOption(idx)
    writeLessonStorage(`aikids_confirm_opt_${lessonId}`, idx)
    const correct = idx === currentStageDef.config.correctIndex
    setIsConfirmCorrect(correct)
    writeLessonStorage(`aikids_confirm_cor_${lessonId}`, correct)
  }, [currentStageDef, lessonId])

  const handleOptionImageError = useCallback((optKey: string) => {
    setFailedOptionImages((prev) => ({ ...prev, [optKey]: true }))
  }, [])

  const handleVideoCompleted = useCallback(() => {
    setIsVideoCompleted(true)
    writeLessonStorage(`aikids_video_done_${lessonId}`, true)
    const currentStars = readLessonStorage<number>(`aikids_lesson_stars_${lessonId}`, 0)
    const nextStars = Math.max(currentStars, 1)
    writeLessonStorage(`aikids_lesson_stars_${lessonId}`, nextStars)
    saveLocalLessonProgress(lessonId, nextStars, false, currentChildId)
    if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
      saveLocalLessonProgress((matchedCurriculum as any).id, nextStars, false, currentChildId)
    }
    if ((matchedCurriculum as any)?.slug && (matchedCurriculum as any).slug !== lessonId) {
      saveLocalLessonProgress((matchedCurriculum as any).slug, nextStars, false, currentChildId)
    }
    clearWorldPageCache()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aikids:xp-updated', { detail: { stars: nextStars } }))
      window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
    }
    onVideoCompletedProp?.()
  }, [currentChildId, lessonId, matchedCurriculum, onVideoCompletedProp])

  const handleSelectQuizAnswer = useCallback((qIdx: number, optIdx: number) => {
    setQuizAnswers((prev) => {
      const next = { ...prev, [qIdx]: optIdx }
      writeLessonStorage(`aikids_quiz_ans_${lessonId}`, next)
      return next
    })
    setCheckedQuestions((prev) => {
      const next = { ...prev, [qIdx]: true }
      writeLessonStorage(`aikids_quiz_chk_${lessonId}`, next)
      return next
    })
  }, [lessonId])

  const handleCheckAnswer = useCallback((qIdx: number) => {
    setCheckedQuestions((prev) => {
      const next = { ...prev, [qIdx]: true }
      writeLessonStorage(`aikids_quiz_chk_${lessonId}`, next)
      return next
    })
  }, [lessonId])

  const handleSetActiveQuizQuestion = useCallback((action: number | ((prev: number) => number)) => {
    setActiveQuizQuestionIdx((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      writeLessonStorage(`aikids_quiz_active_${lessonId}`, next)
      return next
    })
  }, [lessonId])

  const handleSubmitQuiz = useCallback(() => {
    setQuizSubmitted(true)
    writeLessonStorage(`aikids_quiz_sub_${lessonId}`, true)
    const allChecked: Record<number, boolean> = {}
    currentStageDef.config.questions.forEach((_: any, i: number) => {
      allChecked[i] = true
    })
    setCheckedQuestions(allChecked)
    writeLessonStorage(`aikids_quiz_chk_${lessonId}`, allChecked)
    try {
      playInstantSound('star')
    } catch {
      // ignore
    }

    if (indices.practiceIdx < 0) {
      // LÀM ĐẾN ĐÂU LƯU ĐẾN ĐẤY: Lưu ngay hoàn thành bài học 3 sao lên server cho bài học không có thực hành
      hasAutoFinishedRef.current = true
      saveLocalLessonProgress(lessonId, 3, true, currentChildId)
      if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
        saveLocalLessonProgress((matchedCurriculum as any).id, 3, true, currentChildId)
      }
      const completionSummary: LessonCompletionSummary = {
        stars: 3,
        xp: rewardXp || 50,
        answers: submittedQuizAnswers,
        nextLessonSlug: (rewardStageDef?.config as any)?.nextLessonSlug,
      }
      void onFinishLesson?.(completionSummary)
    } else {
      // Bài học có chặng thực hành: Hoàn thành Quiz đạt 2 sao -> Lưu local storage & gửi resume lên server
      writeLessonStorage(`aikids_lesson_stars_${lessonId}`, 2)
      writeLessonStorage(`aikids_quiz_ans_${lessonId}`, quizAnswers)
      writeLessonStorage(`aikids_quiz_sub_${lessonId}`, true)

      saveLocalLessonProgress(lessonId, 2, false, currentChildId)
      if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
        saveLocalLessonProgress((matchedCurriculum as any).id, 2, false, currentChildId)
      }
      if ((matchedCurriculum as any)?.slug && (matchedCurriculum as any).slug !== lessonId) {
        saveLocalLessonProgress((matchedCurriculum as any).slug, 2, false, currentChildId)
      }
      if (matchedCurriculum?.lessonNumber) {
        saveLocalLessonProgress(matchedCurriculum.lessonNumber, 2, false, currentChildId)
      }

      void learningApi.saveResume(lessonId, {
        percent: 67,
        positionSeconds: 0,
        sectionId: 'stage-4',
        occurredAt: new Date().toISOString(),
      }).catch(() => null)

      clearWorldPageCache()
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aikids:xp-updated', { detail: { stars: 2 } }))
        window.dispatchEvent(new CustomEvent('aikids:lesson-completed'))
      }
    }
  }, [currentChildId, currentStageDef, indices.practiceIdx, lessonId, matchedCurriculum, onFinishLesson, rewardStageDef, rewardXp, submittedQuizAnswers])

  const handleQuizImageError = useCallback((qIdx: number) => {
    setFailedQuizImages((prev) => ({ ...prev, [qIdx]: true }))
  }, [])

  const handleSubmitWork = useCallback(({ selectedImage, prompt, practiceState }: any) => {
    setIsPracticeCompleted(true)
    writeLessonStorage(`aikids_practice_done_${lessonId}`, true)
    writeLessonStorage(`aikids_lesson_stars_${lessonId}`, 3)
    setSubmittedArtwork({ image: selectedImage, prompt })
    if (indices.practiceIdx >= 0) {
      setCompletedStages((prev) => new Set([...prev, indices.practiceIdx]))
    }
    saveLocalLessonProgress(lessonId, 3, true, currentChildId)
    if ((matchedCurriculum as any)?.id && (matchedCurriculum as any).id !== lessonId) {
      saveLocalLessonProgress((matchedCurriculum as any).id, 3, true, currentChildId)
    }
    hasAutoFinishedRef.current = true

    const practicePromise = (async () => {
      try {
        await learningApi.savePractice(lessonId, {
          kind: 'studio',
          payload: {
            selectedImage: typeof selectedImage === 'string' ? selectedImage : (selectedImage?.url || ''),
            prompt: prompt || '',
            isSubmitted: true,
            ...(practiceState || selectedImage?.practiceState || {}),
          },
        })
        await learningApi.advanceLesson(lessonId, { fromPhase: 'practice' }).catch(() => null)
      } catch (err) {
        console.warn('Practice sync failed:', err)
      }
    })()

    void onFinishLesson?.({
      stars: 3,
      xp: effectiveRewardXp || 50,
      answers: submittedQuizAnswers,
      keepalive: true,
      practicePromise,
    })
    advanceToStage(indices.rewardIdx >= 0 ? indices.rewardIdx : stages.length - 1)
  }, [advanceToStage, currentChildId, effectiveRewardXp, indices.practiceIdx, indices.rewardIdx, lessonId, matchedCurriculum, onFinishLesson, stages.length, submittedQuizAnswers])

  const handlePracticeStateChange = useCallback((snapshot: any) => {
    if (lessonId) {
      void learningApi.savePractice(lessonId, {
        kind: 'studio',
        payload: snapshot,
      }).catch(() => null)
    }
    onPracticeStateChangeProp?.(snapshot)
  }, [lessonId, onPracticeStateChangeProp])

  return {
    matchedCurriculum,
    isRuleLesson,
    stationInfo,
    stages,
    indices,
    isFinalStation,
    isCompletedLesson,
    currentStage,
    completedStages,
    currentStageDef,
    selectedConfirmOption,
    isConfirmCorrect,
    failedOptionImages,
    videoSeekSec,
    isVideoCompleted,
    quizAnswers,
    quizSubmitted,
    activeQuizQuestionIdx,
    checkedQuestions,
    failedQuizImages,
    isCertificateModalOpen,
    setIsCertificateModalOpen,
    isPracticeCompleted,
    submittedArtwork,
    activePracticePartIndex,
    setActivePracticePartIndex,
    practicePartsState,
    setPracticePartsState,
    zoomImage,
    setZoomImage,
    modalImgSrc,
    zoomScale,
    setZoomScale,
    isFullscreen,
    modalRef,
    toggleFullscreen,
    handleModalImgError,
    handleCloseModal,
    handleStageSelect,
    advanceToStage,
    handleRetryQuestion,
    handleSeekVideo,
    speakCurrentStage,
    quizScore,
    quizStars,
    rewardXp,
    rewardStageDef,
    submittedQuizAnswers,
    earnedStars,
    effectiveStars,
    effectiveRewardXp,
    starCelebration,
    supplementalStageCard,
    legacyStationAlias,
    handleSelectConfirmOption,
    handleOptionImageError,
    handleVideoCompleted,
    handleSelectQuizAnswer,
    handleCheckAnswer,
    handleSetActiveQuizQuestion,
    handleSubmitQuiz,
    handleQuizImageError,
    handleSubmitWork,
    handlePracticeStateChange,
    studentStars,
    onBackToMap,
    onNavigateNextLesson,
    onOpenCourse,
    onFinishLesson,
  }
}
