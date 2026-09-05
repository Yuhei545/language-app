import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScenePicker } from './ScenePicker'

afterEach(cleanup)

function renderPicker(interests: Array<'travel' | 'friends' | 'content'> = ['travel']) {
  return render(
    <ScenePicker
      interests={interests}
      prepEvents={[]}
      busy={false}
      onCreate={vi.fn()}
    />,
  )
}

describe('ScenePicker', () => {
  it('travel の目的では旅行の場面だけを表示する', () => {
    renderPicker(['travel'])

    expect(screen.queryByText('カフェで注文する')).not.toBeNull()
    expect(screen.queryByText('道を尋ねる')).not.toBeNull()
    expect(screen.queryByText('週末の予定を立てる')).toBeNull()
    expect(screen.queryByText('推しの新曲について話す')).toBeNull()
  })

  it('場面を選んでいないと作成ボタンを無効にする', () => {
    renderPicker()

    expect((screen.getByRole('button', { name: 'このレッスンを作る' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('自由入力すると作成ボタンを有効にする', () => {
    renderPicker()

    fireEvent.change(screen.getByRole('textbox', { name: '自由に場面を書く' }), {
      target: { value: '駅で友人と待ち合わせる' },
    })

    expect((screen.getByRole('button', { name: 'このレッスンを作る' }) as HTMLButtonElement).disabled).toBe(false)
  })
})
