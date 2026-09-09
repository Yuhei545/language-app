/**
 * 合成した音声(WAV)を Web Audio で再生する。
 * iPhone では利用者の操作の中で AudioContext を作って resume しないと音が出ないため、
 * unlockAudioPlayback をボタン操作の中で呼ぶ。
 * 画面ロックや他アプリへの切り替えでは、WebKit 独自の interrupted 状態になることがある。
 */
let context: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let finishCurrent: (() => void) | null = null
let failCurrent: ((error: Error) => void) | null = null

export class AudioSuspendedError extends Error {
  constructor() {
    super('音声が止められています。画面に触れて「▶ 再開」を押してください')
    this.name = 'AudioSuspendedError'
  }
}

function getContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const candidate = window as Window & { webkitAudioContext?: typeof AudioContext }
  return window.AudioContext ?? candidate.webkitAudioContext
}

export function isAudioPlaybackSupported(): boolean {
  return getContextConstructor() !== undefined
}

function ensureContext(): AudioContext | null {
  const Constructor = getContextConstructor()
  if (!Constructor) {
    return null
  }
  if (!context) {
    context = new Constructor()
    context.addEventListener('statechange', () => {
      const state = context?.state as string | undefined
      if (state === 'interrupted' || state === 'suspended') {
        failCurrent?.(new AudioSuspendedError())
      }
    })
  }
  return context
}

async function ensureRunning(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'running') {
    return
  }

  let timeout: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<void>((resolve) => {
    timeout = setTimeout(resolve, 1_500)
  })
  try {
    await Promise.race([
      ctx.resume().catch((error) => {
        console.error('音声の再開に失敗しました', error)
      }),
      timeoutPromise,
    ])
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout)
    }
  }

  if ((ctx.state as string) !== 'running') {
    throw new AudioSuspendedError()
  }
}

/** 利用者の操作(タップ)の中で呼ぶ。以後は操作なしでも再生できる。 */
export function unlockAudioPlayback(): void {
  const ctx = ensureContext()
  if (ctx && ctx.state !== 'running') {
    void ctx.resume().catch((error) => {
      console.error('音声の再生を有効にできませんでした', error)
    })
  }
}

export function stopPlayback(): void {
  if (currentSource) {
    try {
      currentSource.stop()
    } catch (error) {
      console.error('再生の停止に失敗しました', error)
    }
  }
  finishCurrent?.()
}

/** WAV でも mp3 でも、decodeAudioData が扱える形式ならそのまま再生する。 */
export async function playAudio(buffer: ArrayBuffer, opts: { rate?: number } = {}): Promise<void> {
  const ctx = ensureContext()
  if (!ctx) {
    throw new Error('この端末では音声の再生が使えません')
  }
  await ensureRunning(ctx)
  // decodeAudioData は渡したバッファを使い切るので、キャッシュ用の元データは複製して渡す
  const decoded = await ctx.decodeAudioData(buffer.slice(0))
  stopPlayback()

  return new Promise((resolve, reject) => {
    const source = ctx.createBufferSource()
    source.buffer = decoded
    const rate = opts.rate !== undefined && Number.isFinite(opts.rate) ? Math.max(0.5, Math.min(2, opts.rate)) : 1
    source.playbackRate.value = rate
    source.connect(ctx.destination)

    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | null = null
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      if (watchdog !== null) {
        clearTimeout(watchdog)
      }
      if (currentSource === source) {
        currentSource = null
        finishCurrent = null
        failCurrent = null
      }
      try {
        source.disconnect()
      } catch (error) {
        console.error('再生ノードの切断に失敗しました', error)
      }
      resolve()
    }

    const fail = (error: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (watchdog !== null) {
        clearTimeout(watchdog)
      }
      if (currentSource === source) {
        currentSource = null
        finishCurrent = null
        failCurrent = null
      }
      source.onended = null
      try {
        source.stop()
      } catch (stopError) {
        console.error('中断された再生の停止に失敗しました', stopError)
      }
      try {
        source.disconnect()
      } catch (disconnectError) {
        console.error('中断された再生ノードの切断に失敗しました', disconnectError)
      }
      reject(error)
    }

    currentSource = source
    finishCurrent = finish
    failCurrent = fail
    source.onended = finish
    watchdog = setTimeout(() => {
      console.warn('再生の終了通知が来なかったため打ち切りました', { seconds: decoded.duration })
      if (ctx.state !== 'running') {
        fail(new AudioSuspendedError())
      } else {
        finish()
      }
    }, (decoded.duration / rate) * 1000 + 2000)
    source.start()
  })
}

/** 互換のための別名。 */
export const playWav = playAudio
