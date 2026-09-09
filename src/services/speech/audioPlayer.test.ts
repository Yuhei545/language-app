import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeAudioBufferSource {
  buffer: AudioBuffer | null = null
  onended: ((this: AudioScheduledSourceNode, ev: Event) => unknown) | null = null
  playbackRate = { value: 1 }

  connect() {}
  disconnect() {}
  stop() {}

  start() {
    this.onended?.call(this as unknown as AudioScheduledSourceNode, new Event('ended'))
  }
}

function installAudioContext(initialState: 'running' | 'interrupted') {
  class FakeAudioContext {
    state = initialState
    destination = {} as AudioDestinationNode

    addEventListener() {}

    resume() {
      return new Promise<void>(() => {})
    }

    async decodeAudioData() {
      return { duration: 0 } as AudioBuffer
    }

    createBufferSource() {
      return new FakeAudioBufferSource()
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext)
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('playAudio', () => {
  it('interrupted のまま再開できなければ AudioSuspendedError で失敗する', async () => {
    installAudioContext('interrupted')
    const { AudioSuspendedError, playAudio } = await import('./audioPlayer')

    const playback = playAudio(new ArrayBuffer(0))
    const rejection = expect(playback).rejects.toBeInstanceOf(AudioSuspendedError)
    await vi.advanceTimersByTimeAsync(1_500)

    await rejection
  })

  it('running なら再生終了時に成功する', async () => {
    installAudioContext('running')
    const { playAudio } = await import('./audioPlayer')

    await expect(playAudio(new ArrayBuffer(0))).resolves.toBeUndefined()
  })
})
