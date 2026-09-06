import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  chunk_key: null,
  created_at: '2026-09-05T00:00:00.000Z',
}

function renderFlashcard(
  isFirstEncounter: boolean,
  overrides: Partial<Parameters<typeof Flashcard>[0]> = {},
) {
  return render(
    <Flashcard
      card={card}
      isFirstEncounter={isFirstEncounter}
      phase="presenting"
      answerVisible={false}
      hintVisible={false}
      hintSaving={false}
      onListen={vi.fn(async () => undefined)}
      onSaidIt={vi.fn()}
      onShowHint={vi.fn(async () => undefined)}
      onGrade={vi.fn(async () => undefined)}
      {...overrides}
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
    expect(screen.queryByRole('button', { name: '🇯🇵 ヒント' })).not.toBeNull()
  })

  it('音読したら「言ってみた」を押す(録音はしない)', () => {
    const onSaidIt = vi.fn()
    renderFlashcard(false, { onSaidIt })

    fireEvent.click(screen.getByRole('button', { name: '🗣️ 言ってみた' }))

    expect(onSaidIt).toHaveBeenCalledOnce()
    expect(screen.queryByText(/録音/)).toBeNull()
  })

  it('答えを見せるときは語・例文・意味と、自分で判定するボタンを出す', () => {
    renderFlashcard(false, { answerVisible: true, phase: 'result' })

    expect(screen.queryByText('apple')).not.toBeNull()
    expect(screen.queryByText('I eat an apple.')).not.toBeNull()
    expect(screen.queryByText('りんご')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '言えた' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'まだ' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: '🗣️ 言ってみた' })).toBeNull()
  })
})
