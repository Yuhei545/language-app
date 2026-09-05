import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiError } from '../services/gemini/errors'
import { Toast } from './Toast'

afterEach(cleanup)

describe('Toast', () => {
  it('GeminiError の原因(HTTP 状態と本文の先頭)を説明の下に小さく添える', () => {
    const cause = Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 })
    render(<Toast error={new GeminiError('Gemini が混雑しています', cause, 'network')} onClose={vi.fn()} />)

    expect(screen.getByText('Gemini が混雑しています')).toBeTruthy()
    expect(screen.getByText(/HTTP 503 .*UNAVAILABLE/)).toBeTruthy()
  })

  it('原因が無ければ説明だけを出す', () => {
    render(<Toast error={new Error('失敗しました')} onClose={vi.fn()} />)

    expect(screen.getByText('失敗しました')).toBeTruthy()
    expect(screen.queryByText(/HTTP/)).toBeNull()
  })
})
