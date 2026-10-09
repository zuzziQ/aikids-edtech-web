import { useCallback, useMemo, useState } from 'react'
import type {
  ArtStyleId,
  CharacterShapeId,
  CharacterVibeId,
} from '@/shared/lib/creation/creative'
import {
  assemblePrompt,
  isPromptComplete,
} from '@/shared/lib/creation/prompt'
import { storyToPanelHints } from '@/shared/lib/creation/story'
import type {
  PromptChip,
  PromptParts,
} from '@/shared/lib/creation/types'
import { api, type QuestDetail } from '@/shared/lib/api'
import { learningApi } from '@/shared/lib/learning-api'
import { clampStationStars } from '@/shared/lib/star-progress'
import {
  EMPTY_PROMPT_LAB,
  promptLabError,
  strongPrompt,
  type PromptLabValue,
} from '@/features/lesson/lib/prompt-lab-state'
import {
  resolvePracticeReview,
  type PracticePreview,
  type PracticeResult,
} from '@/features/lesson/lib/practice-result'
import type { Phase } from '@/features/lesson/components/LessonInteractiveSidebar'
import type { GameHint } from '@/features/lesson/components/games/types'
import { GEN_KINDS, emptyStory } from './lesson-state-helpers'

export interface UseLessonPracticeStateProps {
  quest: QuestDetail | null
  questId: string
  setPhase: (phase: Phase) => void
  setError: (err: string | null) => void
  setBusy: (busy: boolean) => void
  setLiveStars: React.Dispatch<React.SetStateAction<number>>
  setStarBurst: (sb: { id: number; count: number } | null) => void
  setGameHint: (hint: GameHint | null) => void
  recoverCurrentPhase: (err: unknown) => boolean
}

export function useLessonPracticeState({
  quest,
  questId,
  setPhase,
  setError,
  setBusy,
  setLiveStars,
  setStarBurst,
  setGameHint,
  recoverCurrentPhase,
}: UseLessonPracticeStateProps) {
  const [parts, setParts] = useState<PromptParts>({})
  const [generated, setGenerated] = useState<PracticePreview | null>(null)
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null)
  const [practiceSaved, setPracticeSaved] = useState(false)
  const [practiceAdvanced, setPracticeAdvanced] = useState(false)
  const [charName, setCharName] = useState('')
  const [charShape, setCharShape] = useState<CharacterShapeId>('animal')
  const [charVibe, setCharVibe] = useState<CharacterVibeId>('curious')
  const [styleId, setStyleId] = useState<ArtStyleId | null>(null)
  const [story, setStory] = useState(emptyStory)
  const [comicBubbles, setComicBubbles] = useState(['', '', '', ''])
  const [detectivePick, setDetectivePick] = useState<0 | 1 | null>(null)
  const [journalText, setJournalText] = useState('')
  const [promptLab, setPromptLab] = useState<PromptLabValue>(EMPTY_PROMPT_LAB)
  const [paletteColors, setPaletteColors] = useState<string[]>([
    '#6d5efc',
    '#3dbfff',
    '#ffc94a',
  ])
  const [practiceOrder, setPracticeOrder] = useState<string[]>([])
  const [refAssetIds, setRefAssetIds] = useState<string[]>([])
  const [sketchDataUrl, setSketchDataUrl] = useState<string | null>(null)

  const promptText = useMemo(() => assemblePrompt(parts), [parts])
  const panels = useMemo(() => storyToPanelHints(story), [story])
  const practiceStation = quest?.stations?.stations.find(
    (station) => station.kind === 'practice',
  )
  const practiceSteps = practiceStation?.steps?.length
    ? practiceStation.steps
    : [
        practiceStation?.instruction ?? 'Đọc kỹ nhiệm vụ và chọn ý con muốn thực hiện.',
        practiceStation?.product
          ? `Hoàn thành sản phẩm: ${practiceStation.product}`
          : 'Hoàn thành câu trả lời hoặc sản phẩm của con.',
        'Đọc lại, đối chiếu mục tiêu và sửa ít nhất một điểm trước khi lưu.',
      ]
  const practiceCriteria = practiceStation?.successCriteria?.length
    ? practiceStation.successCriteria
    : quest?.goals.slice(0, 4) ?? []
  const orderingCards = practiceStation?.practiceConfig?.cards ?? []
  const effectivePracticeOrder = practiceOrder.length > 0
    ? practiceOrder
    : [...orderingCards].reverse().map((card) => card.id)

  const selectChip = useCallback((chip: PromptChip) => {
    setParts((p) => ({ ...p, [chip.slot]: chip }))
  }, [])

  const practiceReady = useCallback((): string | null => {
    if (!quest) return 'Chưa tải trạm'
    if (quest.practiceKind === 'chips') {
      if (!isPromptComplete(parts)) return 'Ghép đủ 5 thẻ nhé!'
    }
    if (quest.practiceKind === 'story') {
      if (!story.opening || !story.problem || !story.ending) {
        return 'Chọn đủ mở đầu, sự cố và kết nhé!'
      }
    }
    if (quest.practiceKind === 'detective' && detectivePick === null) {
      return 'Chọn một ảnh trước nhé!'
    }
    if (quest.practiceKind === 'character' && !charName.trim()) {
      return 'Đặt tên nhân vật nhé!'
    }
    if (quest.practiceKind === 'style' && !styleId) {
      return 'Chọn một phong cách vẽ nhé!'
    }
    if (
      (quest.practiceKind === 'journal' ||
        quest.practiceKind === 'reflect' ||
        quest.practiceKind === 'spin' ||
        quest.practiceKind === 'match' ||
        quest.practiceKind === 'ai_pick') &&
      journalText.trim().length < 20
    ) {
      return 'Con hãy viết ít nhất 20 ký tự để giải thích trọn ý nhé!'
    }
    if (quest.practiceKind === 'palette' && paletteColors.length < 3) {
      return 'Chọn đủ 3 màu nhé!'
    }
    if (quest.practiceKind === 'palette' && journalText.trim().length < 20) {
      return 'Con hãy giải thích lựa chọn màu của mình ít nhất 20 ký tự nhé!'
    }
    if (quest.practiceKind === 'comic' && comicBubbles.some((bubble) => bubble.trim().length < 2)) {
      return 'Con hãy thêm lời thoại cho đủ bốn khung truyện nhé!'
    }
    if (quest.practiceKind === 'sketch' && !sketchDataUrl) {
      return 'Hãy vẽ vài nét trên canvas trong bài nhé!'
    }
    if (quest.practiceKind === 'video' && !journalText.trim()) {
      return 'Viết mô tả chuyển động hoặc cảnh phim trước nhé!'
    }
    if (quest.practiceKind === 'prompt_lab') {
      return promptLabError(promptLab)
    }
    if (quest.practiceKind === 'ordering') {
      const correct = orderingCards.map((card) => card.id)
      if (effectivePracticeOrder.some((id, index) => id !== correct[index])) {
        return 'Con hãy sắp xếp các thẻ đúng thứ tự trước khi lưu nhé!'
      }
      if (journalText.trim().length < 20) {
        return 'Con hãy giải thích lựa chọn của mình ít nhất 20 ký tự nhé!'
      }
    }
    if (quest.practiceKind === 'card' || quest.practiceKind === 'card_balance') {
      if (!journalText.trim()) {
        return 'Con hãy thiết kế chỉ số cân bằng (<= 20đ) và lưu thẻ bài trước nhé!'
      }
    }
    return null
  }, [
    quest,
    parts,
    story,
    detectivePick,
    charName,
    styleId,
    journalText,
    paletteColors,
    comicBubbles,
    sketchDataUrl,
    promptLab,
    orderingCards,
    effectivePracticeOrder,
  ])

  const savePractice = useCallback(async () => {
    if (!quest) return
    const gate = practiceReady()
    if (gate) {
      setError(gate)
      return
    }
    setBusy(true)
    setError(null)
    try {
      let payload: Record<string, unknown> = {}
      if (quest.practiceKind === 'chips') {
        payload = { parts, freeText: '' }
      } else if (quest.practiceKind === 'character') {
        payload = {
          name: charName.trim(),
          shapeId: charShape,
          vibeId: charVibe,
        }
      } else if (quest.practiceKind === 'style') {
        payload = { styleId }
      } else if (quest.practiceKind === 'story') {
        payload = story
      } else if (quest.practiceKind === 'comic') {
        payload = {
          title: story.title || 'Truyện của con',
          bubbles: comicBubbles,
          panels,
        }
      } else if (quest.practiceKind === 'video') {
        payload = {
          title: quest.title,
          scenes: [{ label: 'Cảnh của con', beat: journalText.trim() }],
          freeText: journalText.trim(),
        }
      } else if (quest.practiceKind === 'detective') {
        payload = { pickedCorrect: detectivePick === 0 }
      } else if (quest.practiceKind === 'sketch') {
        let uploadedUrl: string | undefined
        if (sketchDataUrl && sketchDataUrl.startsWith('data:image/')) {
          try {
            const [header, base64Data] = sketchDataUrl.split(',')
            const mimeMatch = header.match(/data:(.*?);base64/)
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/webp'
            const binaryStr = atob(base64Data)
            const len = binaryStr.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i)
            }
            const blob = new Blob([bytes], { type: mimeType })
            const form = new FormData()
            form.append('file', blob, 'aikids-sketch.webp')
            form.append('permanent', '1')
            form.append('assetType', 'aikids')

            const uploaded = await api<{ asset?: { url: string }; url?: string }>('/api/media/upload', {
              method: 'POST',
              body: form,
            })
            const maybeUrl = uploaded?.asset?.url || uploaded?.url
            if (maybeUrl) {
              uploadedUrl = maybeUrl
            }
          } catch (uploadErr) {
            console.warn('[LessonPage] Không thể upload ảnh vẽ lên storage, fallback sang dataUrl:', uploadErr)
          }
        }

        if (uploadedUrl) {
          payload = {
            sketchUrl: uploadedUrl,
            sketchDataUrl: uploadedUrl,
            text: journalText.trim(),
          }
        } else {
          payload = {
            sketchDataUrl,
            text: journalText.trim(),
          }
        }
      } else if (
        quest.practiceKind === 'journal' ||
        quest.practiceKind === 'reflect' ||
        quest.practiceKind === 'spin' ||
        quest.practiceKind === 'match' ||
        quest.practiceKind === 'drag'
      ) {
        payload = { text: journalText.trim(), freeText: journalText.trim() }
      } else if (quest.practiceKind === 'palette') {
        payload = { colors: paletteColors, text: journalText.trim() }
      } else if (quest.practiceKind === 'ai_pick') {
        payload = {
          prompt: journalText.trim(),
          freeText: journalText.trim(),
        }
      } else if (quest.practiceKind === 'prompt_lab') {
        payload = {
          weakPrompt: promptLab.weak.trim(),
          mediumPrompt: promptLab.medium.trim(),
          strongPrompt: strongPrompt(promptLab),
          strongPromptParts: {
            role: promptLab.role.trim(),
            task: promptLab.task.trim(),
            context: promptLab.context.trim(),
            format: promptLab.format.trim(),
          },
          explanation: promptLab.explanation.trim(),
          freeText: strongPrompt(promptLab),
        }
      } else if (quest.practiceKind === 'ordering') {
        payload = { order: effectivePracticeOrder, plan: journalText.trim(), completed: true }
      } else if (quest.practiceKind === 'card' || quest.practiceKind === 'card_balance') {
        payload = { cardData: journalText.trim(), freeText: journalText.trim(), completed: true }
      } else {
        payload = { ready: true }
      }

      if (GEN_KINDS.has(quest.practiceKind) && refAssetIds.length > 0) {
        payload = { ...payload, assetIds: refAssetIds }
      }

      const res = await learningApi.savePractice<{ result: PracticeResult }>(
        questId,
        {
          kind: quest.practiceKind === 'chips' ? 'prompt' : quest.practiceKind,
          payload,
        },
      )
      const review = resolvePracticeReview(res.result)
      setGenerated(review.preview)
      setPracticeFeedback(review.feedback)
      setPracticeSaved(true)
      try {
        const advance = await learningApi.advanceLesson(questId, {
          fromPhase: 'practice',
        })
        setLiveStars(clampStationStars(advance.progress.stars))
        setStarBurst({ id: Date.now(), count: 1 })
        setPracticeAdvanced(true)
      } catch {
        setError('Sản phẩm đã được lưu, nhưng kết nối chưa mở được phần kiểm tra. Con có thể thử tiếp tục lại.')
      }
    } catch (e) {
      if (!recoverCurrentPhase(e)) {
        setError(e instanceof Error ? e.message : 'Chưa lưu được')
      }
    } finally {
      setBusy(false)
    }
  }, [
    quest,
    practiceReady,
    setError,
    setBusy,
    parts,
    charName,
    charShape,
    charVibe,
    styleId,
    story,
    comicBubbles,
    panels,
    journalText,
    detectivePick,
    sketchDataUrl,
    paletteColors,
    promptLab,
    effectivePracticeOrder,
    refAssetIds,
    questId,
    setLiveStars,
    setStarBurst,
    recoverCurrentPhase,
  ])

  const advanceFromPractice = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await learningApi.advanceLesson(questId, {
        fromPhase: 'practice',
      })
      setLiveStars(clampStationStars(result.progress.stars))
      setStarBurst({ id: Date.now(), count: 1 })
      setPracticeAdvanced(true)
      setPhase('check')
      setGameHint(null)
    } catch (e) {
      if (!recoverCurrentPhase(e)) {
        setError(e instanceof Error ? e.message : 'Chưa lưu được')
      }
    } finally {
      setBusy(false)
    }
  }, [
    questId,
    setBusy,
    setError,
    setLiveStars,
    setStarBurst,
    setPhase,
    setGameHint,
    recoverCurrentPhase,
  ])

  const resetPractice = useCallback(() => {
    setParts({})
    setGenerated(null)
    setPracticeFeedback(null)
    setPracticeSaved(false)
    setPracticeAdvanced(false)
    setCharName('')
    setCharShape('animal')
    setCharVibe('curious')
    setStyleId(null)
    setStory(emptyStory)
    setComicBubbles(['', '', '', ''])
    setDetectivePick(null)
    setJournalText('')
    setPromptLab(EMPTY_PROMPT_LAB)
    setPaletteColors(['#6d5efc', '#3dbfff', '#ffc94a'])
    setPracticeOrder([])
    setRefAssetIds([])
    setSketchDataUrl(null)
  }, [])

  return {
    parts,
    setParts,
    generated,
    setGenerated,
    practiceFeedback,
    setPracticeFeedback,
    practiceSaved,
    setPracticeSaved,
    practiceAdvanced,
    setPracticeAdvanced,
    charName,
    setCharName,
    charShape,
    setCharShape,
    charVibe,
    setCharVibe,
    styleId,
    setStyleId,
    story,
    setStory,
    comicBubbles,
    setComicBubbles,
    detectivePick,
    setDetectivePick,
    journalText,
    setJournalText,
    promptLab,
    setPromptLab,
    paletteColors,
    setPaletteColors,
    practiceOrder,
    setPracticeOrder,
    refAssetIds,
    setRefAssetIds,
    sketchDataUrl,
    setSketchDataUrl,
    promptText,
    panels,
    practiceStation,
    practiceSteps,
    practiceCriteria,
    orderingCards,
    effectivePracticeOrder,
    selectChip,
    practiceReady,
    savePractice,
    advanceFromPractice,
    resetPractice,
  }
}
