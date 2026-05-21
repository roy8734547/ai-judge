'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import type { CaseSetup, TranscriptLine } from '@/types'

const PARTY_COLORS = ['text-gold-400', 'text-blue-400', 'text-emerald-400', 'text-purple-400']
const PARTY_BG = ['bg-gold-500/10 border-gold-500/30', 'bg-blue-500/10 border-blue-500/30', 'bg-emerald-500/10 border-emerald-500/30', 'bg-purple-500/10 border-purple-500/30']

export default function ConfirmPage() {
  const router = useRouter()
  const [setup, setSetup] = useState<CaseSetup | null>(null)
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const rawTranscript = sessionStorage.getItem('ai-judge-transcript')
      const rawSetup = sessionStorage.getItem('ai-judge-setup')
      if (!rawTranscript || !rawSetup) throw new Error('missing')
      setTranscript(JSON.parse(rawTranscript))
      setSetup(JSON.parse(rawSetup))
    } catch {
      router.replace('/')
    }
  }, [router])

  const handleReRecord = () => {
    if (!setup) return
    const params = new URLSearchParams({
      parties: JSON.stringify(setup.parties),
      relationship: setup.relationship,
      tone: setup.tone,
      language: setup.language ?? 'english',
    })
    router.push(`/record?${params.toString()}`)
  }

  const handleSubmit = async () => {
    if (!setup || transcript.length === 0) return
    setIsLoading(true)
    setError('')

    const fullTranscript = transcript.map(l => `${l.speaker}: "${l.text}"`).join('\n')

    try {
      const res = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: fullTranscript,
          parties: setup.parties,
          relationship: setup.relationship,
          tone: setup.tone,
          language: setup.language ?? 'english',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Verdict request failed')

      // Clear sessionStorage now that we're done with it
      sessionStorage.removeItem('ai-judge-transcript')
      sessionStorage.removeItem('ai-judge-setup')

      router.push(
        `/verdict?verdict=${encodeURIComponent(JSON.stringify(data))}&setup=${encodeURIComponent(JSON.stringify(setup))}`
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(`Failed to get verdict: ${message}`)
      setIsLoading(false)
    }
  }

  if (!setup) return null

  const wordCount = transcript.reduce((n, l) => n + l.text.split(' ').length, 0)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-white">Review Transcript</h2>
          <p className="text-navy-400 text-sm">
            Check the transcript below before submitting for analysis. If something's off, re-record.
          </p>
        </div>

        {/* Case meta */}
        <div className="card flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-navy-500">Parties </span>
            <span className="text-white font-medium">{setup.parties.join(', ')}</span>
          </div>
          <div>
            <span className="text-navy-500">Relationship </span>
            <span className="text-white font-medium">{setup.relationship}</span>
          </div>
          <div>
            <span className="text-navy-500">Lines </span>
            <span className="text-white font-medium">{transcript.length}</span>
          </div>
          <div>
            <span className="text-navy-500">Words </span>
            <span className="text-white font-medium">~{wordCount}</span>
          </div>
        </div>

        {/* Speaker legend */}
        <div className="flex flex-wrap gap-2">
          {setup.parties.map((party, i) => (
            <span
              key={party}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${PARTY_BG[i % PARTY_BG.length]} ${PARTY_COLORS[i % PARTY_COLORS.length]}`}
            >
              <span className="w-2 h-2 rounded-full bg-current opacity-70" />
              {party}
            </span>
          ))}
        </div>

        {/* Transcript */}
        <div className="card space-y-0 p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-navy-700 flex items-center justify-between">
            <span className="section-label mb-0">Recorded Transcript</span>
          </div>
          <div className="px-5 py-4 space-y-4 max-h-[50vh] overflow-y-auto">
            {transcript.map((line, i) => {
              const partyIdx = setup.parties.indexOf(line.speaker)
              const color = PARTY_COLORS[partyIdx >= 0 ? partyIdx % PARTY_COLORS.length : 0]
              return (
                <div key={i} className="flex gap-3 items-start">
                  <span className={`flex-shrink-0 text-xs font-bold pt-0.5 min-w-[72px] ${color}`}>
                    {line.speaker}:
                  </span>
                  <p className="text-navy-100 text-sm leading-relaxed">
                    &ldquo;{line.text}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <button
            onClick={handleReRecord}
            disabled={isLoading}
            className="btn-secondary flex-1 flex items-center justify-center gap-2"
          >
            🎙️ Re-record
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-base py-3"
          >
            {isLoading ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                AI Judge is reviewing...
              </>
            ) : (
              <>⚖️ Submit for Analysis</>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
