export type LessonItem = {
  id: string
  kind: 'word' | 'frame' | 'prep'
  cueJa: string
  answer: string
  vocabItemId?: string
}

export type LessonStage = 0 | 1 | 2 | 3 | 4

export type LessonStep = {
  item: LessonItem
  stage: LessonStage
}
