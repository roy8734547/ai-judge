'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/Header'
import type { CaseSetup, TranscriptLine } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type InputMode = 'record' | 'type'
type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'recording'

const MAX_CHARS = 3000
const LS_MODE_KEY = 'ai-judge-input-mode'

const PARTY_COLORS = [
  { text: 'text-gold-400', border: 'border-gold-500/50', bg: 'bg-gold-500/10' },
  { text: 'text-blue-400', border: 'border-blue-500/50', bg: 'bg-blue-500/10' },
  { text: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-500/10' },
  { text: 'text-purple-400', border: 'border-purple-500/50', bg: 'bg-purple-500/10' },
]

const STATUS_UI: Record<ConnectionStatus, { label: string; sub: string; color: string }> = {
  idle: { label: 'Tap to Begin Recording', sub: 'Both parties should speak clearly into the device', color: 'text-gold-300' },
  connecting: { label: 'Connecting...', sub: 'Getting microphone and opening connection', color: 'text-yellow-400' },
  connected: { label: 'Connected — starting mic...', sub: 'Setting up audio stream', color: 'text-emerald-400' },
  recording: { label: 'Recording in progress', sub: 'Tap to stop & review', color: 'text-red-400' },
}

// ── Audio helpers ─────────────────────────────────────────────────────────────

function float32ToInt16(float32: Float32Array): ArrayBuffer {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return int16.buffer
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TranscriptEntry({ speaker, text, parties }: { speaker: string; text: string; parties: string[] }) {
  const idx = parties.indexOf(speaker)
  const color = PARTY_COLORS[idx >= 0 ? idx % PARTY_COLORS.length : 0].text
  return (
    <div className="flex items-start gap-2">
      <span className={`text-xs font-bold pt-0.5 flex-shrink-0 min-w-[60px] ${color}`}>{speaker}:</span>
      <p className="text-white text-sm leading-relaxed">&ldquo;{text}&rdquo;</p>
    </div>
  )
}

// ── Main content ──────────────────────────────────────────────────────────────

function RecordingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ── Setup ──────────────────────────────────────────────────────────────────
  const [setup, setSetup] = useState<CaseSetup | null>(null)
  const setupRef = useRef<CaseSetup | null>(null)

  // ── Mode ───────────────────────────────────────────────────────────────────
  const [mode, setModeState] = useState<InputMode>('record')

  // ── Record state ───────────────────────────────────────────────────────────
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [partialText, setPartialText] = useState('')
  const [timer, setTimer] = useState(0)
  const [error, setError] = useState('')

  // ── Type state ─────────────────────────────────────────────────────────────
  const [textInputs, setTextInputs] = useState<Record<string, string>>({})

  // ── Audio refs ─────────────────────────────────────────────────────────────
  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const parties = JSON.parse(searchParams.get('parties') || '[]')
      const relationship = searchParams.get('relationship') || 'Friends'
      const tone = searchParams.get('tone') || 'serious'
      const language = searchParams.get('language') || 'english'
      const s: CaseSetup = {
        parties,
        relationship: relationship as CaseSetup['relationship'],
        tone: tone as CaseSetup['tone'],
        language: language as CaseSetup['language'],
      }
      setSetup(s)
      setupRef.current = s
    } catch {
      router.push('/')
    }
  }, [searchParams, router])

  // Restore mode from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(LS_MODE_KEY)
    if (saved === 'record' || saved === 'type') setModeState(saved)
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, partialText])

  // ── Recording teardown ─────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    console.log('[AI Judge] stopRecording called')
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }

    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current.onaudioprocess = null
      processorRef.current = null
    }
    if (sourceRef.current) { sourceRef.current.disconnect(); sourceRef.current = null }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        try { wsRef.current.send(JSON.stringify({ type: 'Terminate' })) } catch {}
        wsRef.current.close()
      }
      wsRef.current = null
    }

    setStatus('idle')
    setPartialText('')
    console.log('[AI Judge] Recording stopped')
  }, [])

  useEffect(() => { return () => { stopRecording() } }, [stopRecording])

  // ── Mode switch ────────────────────────────────────────────────────────────
  const setMode = (m: InputMode) => {
    if (m === 'type' && status !== 'idle') stopRecording()
    setError('')
    setModeState(m)
    localStorage.setItem(LS_MODE_KEY, m)
  }

  // ── Recording flow ─────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  const getSpeakerLabel = (speakerLabel: string | undefined): string => {
    const s = setupRef.current
    if (!s) return speakerLabel || 'Speaker'
    const idx = speakerLabel ? speakerLabel.charCodeAt(0) - 65 : 0
    return s.parties[idx] ?? `Speaker ${speakerLabel}`
  }

  const startRecording = async () => {
    setError('')
    setStatus('connecting')
    console.log('[AI Judge] ── startRecording ──')

    try {
      console.log('[AI Judge] Step 1: Fetching AssemblyAI token...')
      const tokenRes = await fetch('/api/get-assembly-token')
      const tokenData = await tokenRes.json()
      if (!tokenData.token) throw new Error(`Token fetch failed: ${tokenData.error || 'no token in response'}`)
      console.log('[AI Judge] Step 1: Token received ✓')

      console.log('[AI Judge] Step 2: Requesting microphone...')
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia not supported (needs HTTPS or localhost)')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream
      console.log('[AI Judge] Step 2: Microphone granted ✓')

      console.log('[AI Judge] Step 3: Creating AudioContext at 16000 Hz...')
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      if (audioContext.state === 'suspended') await audioContext.resume()
      console.log('[AI Judge] Step 3: AudioContext ready ✓ state:', audioContext.state)

      const speechModel = setupRef.current?.language === 'english' ? 'nano' : 'whisper-rt'
      const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&token=${tokenData.token}&speaker_labels=true&speech_model=${speechModel}`
      console.log(`[AI Judge] Step 4: Opening WebSocket (speech_model=${speechModel})...`)
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[AI Judge] Step 4: WebSocket opened ✓')
        setStatus('connected')

        const source = audioContext.createMediaStreamSource(stream)
        sourceRef.current = source
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const processor = audioContext.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        let chunkCount = 0
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return
          const pcm = float32ToInt16(e.inputBuffer.getChannelData(0))
          ws.send(pcm)
          chunkCount++
          if (chunkCount <= 3 || chunkCount % 50 === 0) {
            console.log(`[AI Judge] Audio chunk #${chunkCount} (${pcm.byteLength} bytes PCM)`)
          }
        }

        const silentDest = audioContext.createMediaStreamDestination()
        source.connect(processor)
        processor.connect(silentDest)
        setStatus('recording')
        console.log('[AI Judge] ── Recording started ✓ ──')
        timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)
          if (data.type === 'Turn') {
            if (!data.transcript) return
            if (data.end_of_turn) {
              const speaker = getSpeakerLabel(data.speaker_label)
              console.log(`[AI Judge] Final turn — ${speaker}: "${data.transcript}"`)
              setTranscript(prev => {
                if (prev.length > 0 && prev[prev.length - 1].speaker === speaker) {
                  return [...prev.slice(0, -1), { speaker, text: `${prev[prev.length - 1].text} ${data.transcript}` }]
                }
                return [...prev, { speaker, text: data.transcript as string }]
              })
              setPartialText('')
            } else {
              setPartialText(data.transcript as string)
            }
          }
        } catch (e) { console.warn('[AI Judge] WS parse error:', e) }
      }

      ws.onerror = (e) => {
        console.error('[AI Judge] WebSocket error:', e)
        setError('WebSocket connection error — check browser console for details.')
        stopRecording()
      }

      ws.onclose = (e) => {
        console.log(`[AI Judge] WebSocket closed — code: ${e.code}, reason: "${e.reason}"`)
      }

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[AI Judge] startRecording failed:', err)
      setStatus('idle')
      if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('denied')) {
        setError('Microphone access denied. Click the camera/mic icon in the address bar and allow access.')
      } else if (message.toLowerCase().includes('getusermedia') || message.toLowerCase().includes('https')) {
        setError('Microphone API unavailable. The page must be served over HTTPS or localhost.')
      } else {
        setError(`Recording error: ${message}`)
      }
    }
  }

  const handleStopAndReview = () => {
    stopRecording()
    if (transcript.length === 0) {
      setError('No transcript recorded. Make sure you spoke while the microphone was active and wait for text to appear before stopping.')
      return
    }
    sessionStorage.setItem('ai-judge-transcript', JSON.stringify(transcript))
    sessionStorage.setItem('ai-judge-setup', JSON.stringify(setup))
    router.push('/confirm')
  }

  const handleMicClick = () => {
    if (status === 'recording') handleStopAndReview()
    else if (status === 'idle') startRecording()
  }

  // ── Text input flow ────────────────────────────────────────────────────────
  const handleTextChange = (party: string, value: string) => {
    setTextInputs(prev => ({ ...prev, [party]: value.slice(0, MAX_CHARS) }))
  }

  const handleTextSubmit = () => {
    if (!setup) return
    const lines: TranscriptLine[] = setup.parties
      .filter(p => (textInputs[p] || '').trim().length > 0)
      .map(p => ({ speaker: p, text: textInputs[p].trim() }))
    sessionStorage.setItem('ai-judge-transcript', JSON.stringify(lines))
    sessionStorage.setItem('ai-judge-setup', JSON.stringify(setup))
    router.push('/confirm')
  }

  const canSubmitText = setup
    ? setup.parties.some(p => (textInputs[p] || '').trim().length > 0)
    : false

  // ── Derived ────────────────────────────────────────────────────────────────
  const isRecording = status === 'recording'
  const isTransitioning = status === 'connecting' || status === 'connected'
  const statusUi = STATUS_UI[status]

  if (!setup) return null

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-6">

        {/* ── Case info bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-navy-300">
            <span>👥</span>
            <span>{setup.parties.join(' vs. ')}</span>
            <span className="text-navy-600">·</span>
            <span>{setup.relationship}</span>
          </div>
          {mode === 'record' && (
            <div className={`font-mono font-bold text-lg ${isRecording ? 'text-red-400' : 'text-navy-400'}`}>
              {formatTime(timer)}
            </div>
          )}
        </div>

        {/* ── Mode toggle ─────────────────────────────────────────────────── */}
        <div className="flex justify-center">
          <div className="flex items-center bg-navy-800 border border-navy-700 rounded-xl p-1 gap-1">
            {(['record', 'type'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold
                  transition-all duration-200 select-none
                  ${mode === m
                    ? 'bg-navy-950 text-gold-400 border border-navy-600 shadow-sm'
                    : 'text-navy-400 hover:text-navy-200'
                  }`}
              >
                {m === 'record' ? '🎙️ Record' : '⌨️ Type'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error banner (both modes) ────────────────────────────────────── */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            RECORD MODE
            ════════════════════════════════════════════════════════════════════ */}
        {mode === 'record' && (
          <>
            {/* Connection status pill */}
            {status !== 'idle' && (
              <div className={`flex items-center justify-center gap-2 text-sm font-medium px-4 py-2 rounded-full border mx-auto
                ${status === 'connecting' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300'
                  : status === 'connected' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
                <span className={`w-2 h-2 rounded-full ${
                  status === 'connecting' ? 'bg-yellow-400 animate-pulse'
                    : status === 'connected' ? 'bg-emerald-400 animate-pulse'
                    : 'bg-red-400 animate-pulse'}`} />
                {status === 'connecting' && 'Connecting...'}
                {status === 'connected' && 'Connected — starting audio...'}
                {status === 'recording' && 'Recording'}
              </div>
            )}

            {/* Mic button */}
            <div className="flex flex-col items-center gap-6 py-2">
              <div className="relative">
                {isRecording && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-red-500/30 animate-ping scale-110" />
                    <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping scale-125 [animation-delay:150ms]" />
                  </>
                )}
                <button
                  onClick={handleMicClick}
                  disabled={isTransitioning}
                  className={`relative w-36 h-36 rounded-full flex flex-col items-center justify-center gap-2
                    transition-all duration-300 shadow-2xl active:scale-95
                    disabled:opacity-60 disabled:cursor-not-allowed
                    ${isRecording
                      ? 'bg-red-600 hover:bg-red-500 mic-pulsing text-white shadow-red-500/40'
                      : isTransitioning
                        ? 'bg-navy-700 border-2 border-yellow-500/60 text-yellow-400'
                        : 'bg-navy-800 hover:bg-navy-700 border-2 border-gold-500/60 hover:border-gold-500 text-gold-400'
                    }`}
                >
                  {isTransitioning ? (
                    <svg className="w-10 h-10 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  ) : (
                    <svg className="w-12 h-12" fill={isRecording ? 'white' : 'currentColor'} viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="text-center space-y-1">
                <p className={`font-semibold text-lg ${statusUi.color}`}>{statusUi.label}</p>
                <p className="text-navy-400 text-sm">{statusUi.sub}</p>
              </div>
            </div>

            {/* Live transcript */}
            <div className="card flex-1 flex flex-col min-h-[220px]">
              <div className="section-label flex items-center justify-between">
                <span>Live Transcript</span>
                {isRecording && (
                  <span className="flex items-center gap-1.5 text-red-400 text-xs normal-case font-normal tracking-normal">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                    Live
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-3 max-h-72 pr-1">
                {transcript.length === 0 && !partialText ? (
                  <p className="text-navy-500 text-sm italic text-center py-8">
                    Transcript will appear here as you speak...
                  </p>
                ) : (
                  <>
                    {transcript.map((line, i) => (
                      <TranscriptEntry key={i} speaker={line.speaker} text={line.text} parties={setup.parties} />
                    ))}
                    {partialText && (
                      <div className="flex items-start gap-2 opacity-60">
                        <span className="text-navy-400 text-xs font-mono pt-0.5 flex-shrink-0">...</span>
                        <p className="text-navy-300 text-sm italic">{partialText}</p>
                      </div>
                    )}
                  </>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {status === 'idle' && transcript.length > 0 && (
              <button onClick={handleStopAndReview} className="btn-primary w-full flex items-center justify-center gap-2">
                📋 Review & Submit
              </button>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TYPE MODE
            ════════════════════════════════════════════════════════════════════ */}
        {mode === 'type' && (
          <>
            <p className="text-navy-400 text-sm text-center -mt-2">
              Each party types their own account of the dispute.
            </p>

            {/* Party text cards */}
            <div className={`grid gap-4 ${setup.parties.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {setup.parties.map((party, i) => {
                const color = PARTY_COLORS[i % PARTY_COLORS.length]
                const chars = (textInputs[party] || '').length
                const nearLimit = chars > MAX_CHARS * 0.8
                const atLimit = chars >= MAX_CHARS

                return (
                  <div key={party} className={`card space-y-3 border-2 transition-colors duration-200 ${
                    (textInputs[party] || '').trim().length > 0
                      ? `${color.border} ${color.bg}`
                      : 'border-navy-700'
                  }`}>
                    {/* Card header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center
                          bg-navy-800 border-2 border-current ${color.text}`}>
                          {party[0]?.toUpperCase()}
                        </div>
                        <span className={`font-bold text-base ${color.text}`}>{party}</span>
                      </div>
                      <span className={`text-xs font-mono tabular-nums ${
                        atLimit ? 'text-red-400' : nearLimit ? 'text-yellow-400' : 'text-navy-500'
                      }`}>
                        {chars.toLocaleString()}/{MAX_CHARS.toLocaleString()}
                      </span>
                    </div>

                    {/* Textarea */}
                    <textarea
                      className="input-field resize-none leading-relaxed"
                      style={{ minHeight: '180px' }}
                      placeholder={`Type ${party}'s statement here...`}
                      value={textInputs[party] || ''}
                      onChange={e => handleTextChange(party, e.target.value)}
                      maxLength={MAX_CHARS}
                    />

                    {atLimit && (
                      <p className="text-red-400 text-xs">Character limit reached.</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Submit button */}
            <div className="pb-4">
              <button
                onClick={handleTextSubmit}
                disabled={!canSubmitText}
                className="btn-primary w-full flex items-center justify-center gap-2 text-lg py-4"
              >
                📋 Review & Submit
              </button>
              {!canSubmitText && (
                <p className="text-center text-navy-500 text-sm mt-2">
                  At least one party needs to type a statement
                </p>
              )}
            </div>
          </>
        )}

      </main>
    </div>
  )
}

export default function RecordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-navy-400">Loading...</div>}>
      <RecordingContent />
    </Suspense>
  )
}
