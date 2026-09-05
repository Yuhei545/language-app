import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PracticePage } from './PracticePage'

afterEach(cleanup)

describe('PracticePage', () => {
  it('4つの練習入口を表示する', () => {
    render(<PracticePage />, { wrapper: MemoryRouter })

    expect(screen.queryByText('声で覚えるカード')).not.toBeNull()
    expect(screen.queryByText('文をつくる')).not.toBeNull()
    expect(screen.queryByText('聞いて書く')).not.toBeNull()
    expect(screen.queryByText('音声レッスン')).not.toBeNull()
  })

  it('準備中の2つはリンクにしない', () => {
    render(<PracticePage />, { wrapper: MemoryRouter })

    expect(screen.queryByRole('link', { name: /聞いて書く/ })).toBeNull()
    expect(screen.queryByRole('link', { name: /音声レッスン/ })).toBeNull()
    expect(screen.getAllByText('準備中')).toHaveLength(2)
  })
})
