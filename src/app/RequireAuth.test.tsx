import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequireAuth } from './RequireAuth'

const getSession = vi.hoisted(() => vi.fn())
const onAuthStateChange = vi.hoisted(() => vi.fn(() => () => undefined))
const seedBundledVocab = vi.hoisted(() => vi.fn())
const retireOutdatedEnglish = vi.hoisted(() => vi.fn())
const seedCoreChunks = vi.hoisted(() => vi.fn())

vi.mock('../services/supabase/auth', () => ({ getSession, onAuthStateChange }))
vi.mock('../services/supabase/seed', () => ({ seedBundledVocab }))
vi.mock('../services/supabase/retire', () => ({ retireOutdatedEnglish }))
vi.mock('../features/chunks/seedChunks', () => ({ seedCoreChunks }))

/** PostgREST のエラーは Error ではなく素のオブジェクト。 */
const missingColumn = {
  message: "Could not find the 'chunk_key' column of 'vocab_items' in the schema cache",
  code: 'PGRST204',
}

function renderGuard() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/" element={<p>ホーム</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  getSession.mockResolvedValue({ user: { id: 'user-1' } })
  onAuthStateChange.mockReturnValue(() => undefined)
  seedBundledVocab.mockResolvedValue(undefined)
  retireOutdatedEnglish.mockResolvedValue(0)
  seedCoreChunks.mockResolvedValue(undefined)
})

afterEach(cleanup)

describe('RequireAuth の下ごしらえ', () => {
  it('うまくいけば何も出さず中身を見せる', async () => {
    renderGuard()
    expect(await screen.findByText('ホーム')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('片方が落ちても、もう片方の知らせを上書きしない', async () => {
    seedCoreChunks.mockRejectedValue(missingColumn)
    retireOutdatedEnglish.mockRejectedValue({ message: 'Failed to fetch' })
    renderGuard()

    await waitFor(() => {
      expect(screen.queryByText('同梱語彙を準備できませんでした')).not.toBeNull()
    })
    expect(screen.queryByText('型・句動詞のカードを用意できませんでした')).not.toBeNull()
    expect(screen.queryByText('Failed to fetch')).not.toBeNull()
    // 練習は続けられるので、中身は出したまま
    expect(screen.queryByText('ホーム')).not.toBeNull()
  })

  it('006 が無いときは実行するファイルを案内する', async () => {
    seedCoreChunks.mockRejectedValue(missingColumn)
    renderGuard()

    await waitFor(() => {
      expect(screen.queryByText(/006_chunks\.sql/)).not.toBeNull()
    })
    expect(screen.queryByText('同梱語彙を準備できませんでした')).toBeNull()
  })

  it('閉じられる。もう一度試すとやり直し、直っていれば消える', async () => {
    seedCoreChunks.mockRejectedValueOnce(missingColumn).mockRejectedValueOnce(missingColumn)
    renderGuard()

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeNull()
    })
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(screen.queryByRole('alert')).toBeNull()

    // 出し直すために、もう一度エラーを出してから再試行する
    cleanup()
    seedCoreChunks.mockRejectedValue(missingColumn)
    renderGuard()
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeNull()
    })

    seedCoreChunks.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'もう一度試す' }))
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull()
    })
    expect(seedCoreChunks.mock.calls.length).toBeGreaterThanOrEqual(4)
  })
})
