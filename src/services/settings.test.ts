import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings, setSettings } from './settings'

const defaults = {
  geminiApiKey: '',
  geminiModel: '',
  sttEngine: 'auto',
  ttsVoice: { en: null, ko: null },
  ttsVoiceB: { en: null, ko: null },
  ttsRate: 0.9,
  interests: [],
  parentName: { en: '', ko: '' },
  mixingLevel: 1,
  lessonPauseSeconds: 4,
  lessonRecording: false,
  micDeviceId: null,
  ttsVoiceJa: null,
  personalWords: [],
}

describe('settings service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('保存内容がない場合は既定値を返す', () => {
    expect(getSettings()).toEqual(defaults)
  })

  it('設定を保存し、再取得できる', () => {
    setSettings({
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-test',
      interests: ['travel', 'content'],
      ttsRate: 0.8,
    })

    expect(getSettings()).toEqual({
      ...defaults,
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-test',
      interests: ['travel', 'content'],
      ttsRate: 0.8,
    })
  })

  it('壊れたJSONの場合はエラーを出力して既定値を返す', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('lla.settings', '{broken json')

    expect(getSettings()).toEqual(defaults)
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  it('lessonPauseSeconds が範囲外なら既定値へ戻す', () => {
    localStorage.setItem('lla.settings', JSON.stringify({
      ...defaults,
      geminiApiKey: 'keep-this-key',
      lessonPauseSeconds: 9,
    }))

    expect(getSettings()).toEqual({
      ...defaults,
      geminiApiKey: 'keep-this-key',
    })
  })

  it('personalWords がない既存の保存データは空配列で補う', () => {
    const { personalWords: _personalWords, ...legacySettings } = defaults
    localStorage.setItem('lla.settings', JSON.stringify(legacySettings))

    expect(getSettings()).toEqual(defaults)
  })

  it.each([
    ['配列でない', {}],
    ['kind が不正', [{ ja: '浅草', en: 'Asakusa', ko: '아사쿠사', kind: 'time' }]],
    ['ja が文字列でない', [{ ja: 1, en: 'Asakusa', ko: '아사쿠사', kind: 'place' }]],
  ])('personalWords が%s場合は保存内容を拒否する', (_label, personalWords) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    localStorage.setItem('lla.settings', JSON.stringify({ ...defaults, personalWords }))

    expect(getSettings()).toEqual(defaults)
    expect(errorSpy).toHaveBeenCalledOnce()
  })
})
