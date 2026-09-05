import { useCallback, useEffect, useRef, useState } from 'react'
import { getSettings, setSettings, subscribe } from '../../services/settings'

type InputDetails = {
  label: string
  channelCount?: number
  sampleRate?: number
}

type AudioContextConstructor = new () => AudioContext

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor
  }
  return window.AudioContext ?? audioWindow.webkitAudioContext
}

function errorMessage(error: unknown): string {
  if (
    error instanceof DOMException
    && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return 'マイクの使用が許可されていません。ブラウザの権限設定を確認してください'
  }
  return error instanceof Error ? error.message : String(error)
}

export function MicTest() {
  const [micDeviceId, setMicDeviceId] = useState(getSettings().micDeviceId)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [details, setDetails] = useState<InputDetails | null>(null)
  const [rms, setRms] = useState(0)
  const [peak, setPeak] = useState(0)
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const peakHistoryRef = useRef<Array<{ time: number; value: number }>>([])
  const generationRef = useRef(0)
  const mountedRef = useRef(true)

  const releaseResources = useCallback(async (showCloseError: boolean) => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    peakHistoryRef.current = []
    sourceRef.current?.disconnect()
    analyserRef.current?.disconnect()
    sourceRef.current = null
    analyserRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    const context = contextRef.current
    contextRef.current = null
    if (context && context.state !== 'closed') {
      try {
        await context.close()
      } catch (closeError) {
        console.error('マイクテストの AudioContext を閉じられませんでした', closeError)
        if (showCloseError && mountedRef.current) {
          setError(errorMessage(closeError))
        }
      }
    }
  }, [])

  const startTest = useCallback(async (deviceId: string | null = micDeviceId) => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    setStarting(true)
    setRunning(false)
    setError(null)
    setRms(0)
    setPeak(0)
    setDetails(null)
    await releaseResources(false)

    try {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices.enumerateDevices) {
        throw new Error('この端末ではマイクテストを利用できません')
      }
      const AudioContextClass = getAudioContextConstructor()
      if (!AudioContextClass) {
        throw new Error('この端末では音声レベルを測定できません')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
      if (generationRef.current !== generation) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      const context = new AudioContextClass()
      contextRef.current = context
      if (context.state === 'suspended') {
        await context.resume()
      }
      if (generationRef.current !== generation) {
        await releaseResources(false)
        return
      }

      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      sourceRef.current = source
      analyserRef.current = analyser

      const track = stream.getAudioTracks()[0]
      const trackSettings = track?.getSettings()
      setDetails({
        label: track?.label || '不明',
        channelCount: trackSettings?.channelCount,
        sampleRate: trackSettings?.sampleRate,
      })
      const availableDevices = await navigator.mediaDevices.enumerateDevices()
      if (generationRef.current !== generation) {
        await releaseResources(false)
        return
      }
      setDevices(availableDevices.filter((device) => device.kind === 'audioinput'))
      setPermissionGranted(true)

      const samples = new Float32Array(analyser.fftSize)
      intervalRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        let sumSquares = 0
        for (let index = 0; index < samples.length; index += 1) {
          sumSquares += samples[index] * samples[index]
        }
        const nextRms = Math.sqrt(sumSquares / samples.length)
        const now = Date.now()
        const recentPeaks = peakHistoryRef.current.filter(
          (entry) => entry.time >= now - 2_000,
        )
        recentPeaks.push({ time: now, value: nextRms })
        peakHistoryRef.current = recentPeaks

        if (mountedRef.current && generationRef.current === generation) {
          setRms(nextRms)
          setPeak(recentPeaks.reduce(
            (maximum, entry) => Math.max(maximum, entry.value),
            0,
          ))
        }
      }, 100)
      setRunning(true)
    } catch (startError) {
      await releaseResources(false)
      if (mountedRef.current && generationRef.current === generation) {
        setError(errorMessage(startError))
      }
    } finally {
      if (mountedRef.current && generationRef.current === generation) {
        setStarting(false)
      }
    }
  }, [micDeviceId, releaseResources])

  const stopTest = useCallback(async () => {
    generationRef.current += 1
    await releaseResources(true)
    if (mountedRef.current) {
      setStarting(false)
      setRunning(false)
      setRms(0)
      setPeak(0)
    }
  }, [releaseResources])

  const selectDevice = (value: string) => {
    const nextDeviceId = value || null
    try {
      setSettings({ micDeviceId: nextDeviceId })
      setError(null)
      if (running || starting) {
        void startTest(nextDeviceId)
      }
    } catch (settingsError) {
      setError(errorMessage(settingsError))
    }
  }

  useEffect(() => subscribe((settings) => {
    setMicDeviceId(settings.micDeviceId)
  }), [])

  useEffect(() => () => {
    mountedRef.current = false
    generationRef.current += 1
    void releaseResources(false)
  }, [releaseResources])

  const levelPercent = Math.min(1, rms * 5) * 100

  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800">マイクテスト</h3>
          <p className="mt-1 text-xs text-slate-500">ブラウザに届いている音量を確認します。</p>
        </div>
        <button
          type="button"
          onClick={() => void (running ? stopTest() : startTest())}
          disabled={starting}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${running ? 'bg-slate-700' : 'bg-teal-700'}`}
        >
          {starting ? '準備中…' : running ? '停止' : 'マイクテストを開始'}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {permissionGranted ? (
        <label className="mt-4 block">
          <span className="mb-2 block text-xs font-bold text-slate-700">入力デバイス</span>
          <select
            value={micDeviceId ?? ''}
            onChange={(event) => selectDevice(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="">端末の既定</option>
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `マイク ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {running && details ? (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4" aria-live="polite">
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-teal-500 transition-[width] duration-100"
              style={{ width: `${levelPercent}%` }}
              role="meter"
              aria-label="マイク入力レベル"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(levelPercent)}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
            <p>RMS <span className="font-bold tabular-nums text-slate-900">{rms.toFixed(3)}</span></p>
            <p>2秒ピーク <span className="font-bold tabular-nums text-slate-900">{peak.toFixed(3)}</span></p>
            <p className="col-span-2 truncate" title={details.label}>入力: <span className="font-bold text-slate-900">{details.label}</span></p>
            <p>チャンネル: <span className="font-bold text-slate-900">{details.channelCount ?? '不明'}</span></p>
            <p>サンプルレート: <span className="font-bold text-slate-900">{details.sampleRate ?? '不明'}</span></p>
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-xs leading-5 text-slate-500">
        話してもバーが動かないときは、Windows のサウンド設定で入力デバイスを確認してください。
        バーが動くのに録音で「小さすぎます」と出る場合は、その時の数値を教えてください。
      </p>
    </div>
  )
}
