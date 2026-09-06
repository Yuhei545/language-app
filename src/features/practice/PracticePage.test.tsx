import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PracticePage } from './PracticePage'

afterEach(cleanup)

describe('PracticePage', () => {
  it('4つの練習入口を表示する', () => {
    render(<PracticePage />, { wrapper: MemoryRouter })

    expect(screen.queryByText('声で覚えるカード')).not.toBeNull()
    expect(screen.queryByText('瞬間組み立て')).not.toBeNull()
    expect(screen.queryByText('聞いて書く')).not.toBeNull()
    expect(screen.queryByText('音声レッスン')).not.toBeNull()
  })

  it('聞いて書くと音声レッスンはリンクになる', () => {
    render(<PracticePage />, { wrapper: MemoryRouter })

    expect(screen.queryByRole('link', { name: /聞いて書く/ })).not.toBeNull()
    expect(screen.queryByRole('link', { name: /音声レッスン/ })).not.toBeNull()
    expect(screen.queryByText('準備中')).toBeNull()
  })
})
