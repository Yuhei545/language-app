import { useCallback, useEffect, useRef, useState } from 'react'
import { getSettings, setSettings, subscribe } from '../../services/settings'
import { downmixToMono, downsampleTo16k, peakRms } from '../../services/speech/wav'

type InputDetails = {
  label: string
  channelCount?: number
  sampleRate?: number
  muted: boolean
  readyState: MediaStreamTrackState
  enabled: boolean
  contextState: AudioContextState
  contextSampleRate: number
}

type AudioContextConstructor = new () => AudioContext

const VIRTUAL_DEVICE_PATTERN = /virtual|cable|vb-audio|voicemeeter|stereo mix/i

function isVirtualDevice(label: string): boolean {
  return VIRTUAL_DEVICE_PATTERN.test(label)
}

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
  const [defaultDeviceLabel, setDefaultDeviceLabel] = useState<string | null>(null)
  const [recording, setRecording] = useState(false)
  const [recordingPeak, setRecordingPeak] = useState<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const peakHistoryRef = useRef<Array<{ time: number; value: number }>>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingContextRef = useRef<AudioContext | null>(null)
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
    streamRef.current?.getTracks().forEach((track) => {
      track.onmute = null
      track.onunmute = null
      track.onended = null
      track.stop()
    })
    streamRef.current = null

    const context = contextRef.current
    contextRef.current = null
    if (context) {
      context.onstatechange = null
    }
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

  const releaseRecordingResources = useCallback(async () => {
    if (recordingTimerRef.current !== null) {
      clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }

    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
    recordingStreamRef.current = null

    const context = recordingContextRef.current
    recordingContextRef.current = null
    if (context && context.state !== 'closed') {
      try {
        await context.close()
      } catch (closeError) {
        console.error('録音経路の AudioContext を閉じられませんでした', closeError)
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

    try {
      await releaseResources(false)
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
      if (!track) {
        throw new Error('マイクの音声トラックを取得できませんでした')
      }
      const updateDetails = () => {
        if (!mountedRef.current || generationRef.current !== generation) {
          return
        }
        const trackSettings = track.getSettings()
        setDetails({
          label: track.label || '不明',
          channelCount: trackSettings.channelCount,
          sampleRate: trackSettings.sampleRate,
          muted: track.muted,
          readyState: track.readyState,
          enabled: track.enabled,
          contextState: context.state,
          contextSampleRate: context.sampleRate,
        })
      }
      track.onmute = updateDetails
      track.onunmute = updateDetails
      track.onended = updateDetails
      context.onstatechange = updateDetails
      updateDetails()
      if (!deviceId) {
        setDefaultDeviceLabel(track.label || '不明')
      }
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
      if (mountedRef.current) {
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

  const measureRecording = useCallback(async () => {
    setRecording(true)
    setRecordingPeak(null)
    setError(null)

    try {
      await releaseRecordingResources()
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('この端末では3秒録音を利用できません')
      }
      const AudioContextClass = getAudioContextConstructor()
      if (!AudioContextClass) {
        throw new Error('この端末では録音した音声を測定できません')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      })
      recordingStreamRef.current = stream
      const track = stream.getAudioTracks()[0]
      if (!track) {
        throw new Error('録音用の音声トラックを取得できませんでした')
      }
      if (!micDeviceId && mountedRef.current) {
        setDefaultDeviceLabel(track.label || '不明')
      }

      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      const chunks: Blob[] = []
      const audioBlob = await new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data)
          }
        }
        recorder.onerror = () => {
          reject(new Error('3秒録音に失敗しました'))
        }
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
        }

        recorder.start()
        recordingTimerRef.current = setTimeout(() => {
          recordingTimerRef.current = null
          if (recorder.state !== 'inactive') {
            recorder.stop()
          }
        }, 3_000)
      })
      if (audioBlob.size === 0) {
        throw new Error('録音データが空でした')
      }

      const context = new AudioContextClass()
      recordingContextRef.current = context
      const audioBuffer = await context.decodeAudioData(await audioBlob.arrayBuffer())
      const channels = Array.from(
        { length: audioBuffer.numberOfChannels },
        (_, index) => audioBuffer.getChannelData(index),
      )
      const mono = downmixToMono(channels)
      const resampled = downsampleTo16k(mono, audioBuffer.sampleRate)
      const measuredPeak = peakRms(resampled, 16_000)
      if (mountedRef.current) {
        setRecordingPeak(measuredPeak)
      }
    } catch (recordingError) {
      if (mountedRef.current) {
        setError(errorMessage(recordingError))
      }
    } finally {
      await releaseRecordingResources()
      if (mountedRef.current) {
        setRecording(false)
      }
    }
  }, [micDeviceId, releaseRecordingResources])

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

  useEffect(() => {
    if (micDeviceId !== null || !navigator.mediaDevices?.getUserMedia) {
      setDefaultDeviceLabel(null)
      return undefined
    }

    const existingTrack = streamRef.current?.getAudioTracks()[0]
    if (existingTrack) {
      setDefaultDeviceLabel(existingTrack.label || '不明')
      return undefined
    }

    let active = true
    const readDefaultDevice = async () => {
      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const track = stream.getAudioTracks()[0]
        if (!track) {
          throw new Error('Chrome の既定マイクを確認できませんでした')
        }
        if (active && mountedRef.current) {
          setDefaultDeviceLabel(track.label || '不明')
          setPermissionGranted(true)
        }
        const availableDevices = navigator.mediaDevices.enumerateDevices
          ? await navigator.mediaDevices.enumerateDevices()
          : []
        if (active && mountedRef.current) {
          setDevices(availableDevices.filter((device) => device.kind === 'audioinput'))
        }
      } catch (defaultDeviceError) {
        console.warn('Chrome の既定マイクを確認できませんでした', defaultDeviceError)
      } finally {
        stream?.getTracks().forEach((track) => track.stop())
      }
    }

    void readDefaultDevice()
    return () => {
      active = false
    }
  }, [micDeviceId])

  useEffect(() => () => {
    mountedRef.current = false
    generationRef.current += 1
    void releaseResources(false)
    void releaseRecordingResources()
  }, [releaseRecordingResources, releaseResources])

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
          disabled={starting && !running}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-50 ${running ? 'bg-slate-700' : 'bg-teal-700'}`}
        >
          {running ? '停止' : starting ? '準備中…' : 'マイクテストを開始'}
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
                {isVirtualDevice(device.label) ? ' (仮想)' : ''}
              </option>
            ))}
          </select>
          {micDeviceId === null && defaultDeviceLabel ? (
            <span className="mt-2 block text-xs text-slate-600">
              Chrome の既定: <span className="font-bold text-slate-900">{defaultDeviceLabel}</span>
            </span>
          ) : null}
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
            <p>消音扱い: <span className="font-bold text-slate-900">{details.muted ? 'はい' : 'いいえ'}</span></p>
            <p>トラック状態: <span className="font-bold text-slate-900">{details.readyState}</span></p>
            <p>トラック有効: <span className="font-bold text-slate-900">{details.enabled ? 'はい' : 'いいえ'}</span></p>
            <p>AudioContext: <span className="font-bold text-slate-900">{details.contextState}</span></p>
            <p className="col-span-2">Contextサンプルレート: <span className="font-bold text-slate-900">{details.contextSampleRate}</span></p>
          </div>
          {details.muted ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900" role="alert">
              ブラウザがこのマイクから音を受け取れていません(消音扱い)。Chrome の再起動、または別のマイクを試してください
            </p>
          ) : null}
          {isVirtualDevice(details.label) ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900" role="alert">
              これは仮想デバイスで、実際のマイクの音は入っていません。一覧から実際のマイクを選んでください
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() => void measureRecording()}
          disabled={recording}
          className="w-full rounded-xl bg-indigo-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {recording ? '録音中…' : '3秒録音して測る'}
        </button>
        {recordingPeak !== null ? (
          <p className="mt-3 text-center text-sm text-slate-700" aria-live="polite">
            録音経路の最大音量: <span className="font-bold tabular-nums text-slate-950">{recordingPeak.toFixed(3)}</span>
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate-500">
        話してもバーが動かないときは、Windows のサウンド設定で入力デバイスを確認してください。
        バーが動くのに録音で「小さすぎます」と出る場合は、その時の数値を教えてください。
        この画面で 0 のままでも、下の「3秒録音して測る」で数値が出れば録音は使えます。
      </p>
    </div>
  )
}
