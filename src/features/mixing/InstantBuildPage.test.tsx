import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InstantBuildPage } from './InstantBuildPage'

vi.mock('../../app/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }),
}))
vi.mock('./TwoWordPage', () => ({ TwoWordPage: () => <p>2 語の画面</p> }))
vi.mock('./PatternPage', () => ({ PatternPage: () => <p>型の画面</p> }))
vi.mock('./PiecesPage', () => ({ PiecesPage: () => <p>ピースの画面</p> }))
vi.mock('./TopicPage', () => ({ TopicPage: () => <p>お題の画面</p> }))
vi.mock('./QuickPage', () => ({ QuickPage: () => <p>即答の画面</p> }))

afterEach(cleanup)

describe('InstantBuildPage', () => {
  it('5 つの段階をタブで切り替える。既定は型を回す', () => {
    render(<InstantBuildPage />)

    expect(screen.queryByRole('heading', { name: '瞬間組み立て' })).not.toBeNull()
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    expect(screen.queryByRole('tab', { name: /型を回す/ })?.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByText('型の画面')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /2 語で言う/ }))
    expect(screen.queryByText('2 語の画面')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /ピースをつなぐ/ }))
    expect(screen.queryByText('ピースの画面')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /お題で言う/ }))
    expect(screen.queryByText('お題の画面')).not.toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: /即答/ }))
    expect(screen.queryByText('即答の画面')).not.toBeNull()
  })
})
