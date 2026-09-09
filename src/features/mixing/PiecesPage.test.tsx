import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pieceById } from '../../content/pieceSchema'
import { PiecesPage } from './PiecesPage'

const usePiecesSession = vi.hoisted(() => vi.fn())

vi.mock('./usePiecesSession', () => ({ usePiecesSession }))

const can = pieceById('p01')!
const didntKnow = pieceById('p45')!

const fitItem = {
  id: 'p01:0',
  piece: can,
  combo: can.combos[0],
  cueJa: can.combos[0].ja,
  answer: 'I can show you.',
  fromSmall: false,
}

const linkItem = {
  id: 'p45:0',
  piece: didntKnow,
  combo: didntKnow.combos[3],
  cueJa: didntKnow.combos[3].ja,
  inner: 'You were coming.',
  answer: "I didn't know you were coming.",
  fromSmall: false,
}

const status = { seen: 0, said: 0, acquired: false, lastAt: null }

function session(overrides: Record<string, unknown> = {}) {
  return {
    supported: true,
    phase: 'idle',
    stage: 'fit',
    list: [{ piece: can, status: { seen: 8, said: 3, acquired: true, lastAt: 1 } }, { piece: pieceById('p02')!, status }],
    upcoming: [pieceById('p02')!, pieceById('p03')!, pieceById('p04')!],
    session: null,
    currentPiece: can,
    currentItem: fitItem,
    pieceIndex: 0,
    pieceCount: 3,
    itemIndex: 0,
    itemCount: 5,
    secondsLeft: 3,
    summary: null,
    error: null,
    chunkKey: (id: string) => `piece:${id}`,
    start: vi.fn(),
    beginItems: vi.fn(),
    reveal: vi.fn(),
    judgeSelf: vi.fn(),
    say: vi.fn(),
    stop: vi.fn(),
    setStage: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

afterEach(cleanup)

describe('PiecesPage', () => {
  it('はじめる前に今回のピースと一覧を見せ、一覧から選んで始められる', () => {
    const current = session()
    usePiecesSession.mockReturnValue(current)
    render(<PiecesPage lang="en" />)

    expect(screen.queryByRole('heading', { name: 'ピースをつなぐ' })).not.toBeNull()
    // 今回のピース(チップ)と一覧の両方に出る
    expect(screen.getAllByText('I got to 〜').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('身についた')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /02/ }))
    expect(current.start).toHaveBeenCalledWith('p02')
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(current.start).toHaveBeenLastCalledWith()
    fireEvent.click(screen.getByRole('button', { name: 'つなぐ' }))
    expect(current.setStage).toHaveBeenCalledWith('link')
  })

  it('紹介ではピースの意味と例文', () => {
    const current = session({ phase: 'intro' })
    usePiecesSession.mockReturnValue(current)
    render(<PiecesPage lang="en" />)

    expect(screen.queryByText('I can 〜')).not.toBeNull()
    expect(screen.queryByText('I can show you.')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'このピースで練習する' }))
    expect(current.beginItems).toHaveBeenCalled()
  })

  it('はめる: 合図は日本語とピースの頭。答えは出さない', () => {
    usePiecesSession.mockReturnValue(session({ phase: 'thinking' }))
    render(<PiecesPage lang="en" />)

    expect(screen.queryByText('「見せる」')).not.toBeNull()
    expect(screen.queryByText('I can 〜')).not.toBeNull()
    expect(screen.queryByText('I can show you.')).toBeNull()
    expect(screen.queryByText(/あと 3 秒/)).not.toBeNull()
  })

  it('つなぐ: 中の文を先に見せ、答えで言えたを押す', () => {
    const current = session({ phase: 'model', stage: 'link', currentPiece: didntKnow, currentItem: linkItem })
    usePiecesSession.mockReturnValue(current)
    render(<PiecesPage lang="en" />)

    expect(screen.queryByText('You were coming.')).not.toBeNull()
    expect(screen.queryByText("I didn't know you were coming.")).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '言えた' }))
    expect(current.judgeSelf).toHaveBeenCalledWith(true)
  })

  it('終わりに言えた数とピースの状態', () => {
    usePiecesSession.mockReturnValue(session({
      phase: 'finished',
      summary: { said: 12, total: 15, pieces: [{ piece: can, status: { seen: 5, said: 4, acquired: false, lastAt: 1 } }] },
    }))
    render(<PiecesPage lang="en" />)

    expect(screen.queryByText('12/15')).not.toBeNull()
    expect(screen.queryByText('出会い 5/8 ・ 言えた 4/3')).not.toBeNull()
  })

  it('韓国語ではまだ使えないことを伝える', () => {
    usePiecesSession.mockReturnValue(session({ supported: false }))
    render(<PiecesPage lang="ko" />)
    expect(screen.queryByText(/韓国語は後で足します/)).not.toBeNull()
  })
})
