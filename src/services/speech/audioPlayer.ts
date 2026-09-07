/**
 * 合成した音声(WAV)を Web Audio で再生する。
 * iPhone では利用者の操作の中で AudioContext を作って resume しないと音が出ないため、
 * unlockAudioPlayback をボタン操作の中で呼ぶ。
 */
let context: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let finishCurrent: (() => void) | null = null

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
  context ??= new Constructor()
  return context
}

/** 利用者の操作(タップ)の中で呼ぶ。以後は操作なしでも再生できる。 */
export function unlockAudioPlayback(): void {
  const ctx = ensureContext()
  if (ctx && ctx.state === 'suspended') {
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
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
  // decodeAudioData は渡したバッファを使い切るので、キャッシュ用の元データは複製して渡す
  const decoded = await ctx.decodeAudioData(buffer.slice(0))
  stopPlayback()

  return new Promise((resolve) => {
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
      }
      try {
        source.disconnect()
      } catch (error) {
        console.error('再生ノードの切断に失敗しました', error)
      }
      resolve()
    }

    currentSource = source
    finishCurrent = finish
    source.onended = finish
    watchdog = setTimeout(() => {
      console.warn('再生の終了通知が来なかったため打ち切りました', { seconds: decoded.duration })
      finish()
    }, (decoded.duration / rate) * 1000 + 2000)
    source.start()
  })
}

/** 互換のための別名。 */
export const playWav = playAudio
