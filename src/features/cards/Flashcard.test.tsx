import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { VocabItemRow } from '../../services/supabase/types'
import { Flashcard } from './Flashcard'

vi.mock('../../services/speech/tts', () => ({
  speak: vi.fn(),
  unlockAudio: vi.fn(),
}))

const card: VocabItemRow = {
  id: 'vocab-1',
  user_id: 'user-1',
  lang: 'en',
  week: 1,
  text: 'apple',
  emoji: '🍎',
  hint_ja: 'りんご',
  example: 'I eat an apple.',
  category: 'core',
  source: 'bundled',
  prep_event_id: null,
  created_at: '2026-09-05T00:00:00.000Z',
}

function renderFlashcard(isFirstEncounter: boolean) {
  return render(
    <Flashcard
      card={card}
      isFirstEncounter={isFirstEncounter}
      phase="presenting"
      attempt={null}
      hintVisible={false}
      hintSaving={false}
      sttEngine={null}
      onListen={vi.fn(async () => undefined)}
      onStartRecording={vi.fn(async () => undefined)}
      onStopRecording={vi.fn(async () => undefined)}
      onShowHint={vi.fn(async () => undefined)}
      onGrade={vi.fn(async () => undefined)}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Flashcard', () => {
  it('初めて出会う語では日本語の意味と例文を表示する', () => {
    renderFlashcard(true)

    expect(screen.queryByText('りんご')).not.toBeNull()
    expect(screen.queryByText('I eat an apple.')).not.toBeNull()
  })

  it('既習語の提示中は日本語の意味を隠してヒントボタンを表示する', () => {
    renderFlashcard(false)

    expect(screen.queryByText('りんご')).toBeNull()
    expect(screen.queryByRole('button', { name: /ヒント/ })).not.toBeNull()
  })

  it('初めて出会う語の提示中はヒントボタンを表示しない', () => {
    renderFlashcard(true)

    expect(screen.queryByRole('button', { name: /ヒント/ })).toBeNull()
  })
})
