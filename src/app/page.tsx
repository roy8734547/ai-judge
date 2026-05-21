'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import type { Tone, Relationship, Language } from '@/types'

const RELATIONSHIPS: Relationship[] = [
  'Spouse/Partner',
  'Parent & Child',
  'Siblings',
  'Friends',
  'Coworkers',
  'Neighbors',
  'Other',
]

const LANGUAGES: { value: Language; label: string; sub: string; emoji: string; badge?: string }[] = [
  {
    value: 'english',
    label: 'English Only',
    sub: 'Standard real-time transcription',
    emoji: '🇺🇸',
  },
  {
    value: 'mandarin',
    label: '中文 (Mandarin)',
    sub: 'Verdict written in Simplified Chinese',
    emoji: '🇨🇳',
    badge: 'Whisper AI',
  },
  {
    value: 'bilingual',
    label: 'English + 中文',
    sub: 'Bilingual verdict — English & Chinese',
    emoji: '🌏',
    badge: 'Whisper AI',
  },
]

const TONES: { value: Tone; label: string; description: string; emoji: string }[] = [
  {
    value: 'serious',
    label: 'Serious',
    description: 'Like a real courtroom',
    emoji: '🏛️',
  },
  {
    value: 'warm',
    label: 'Warm & Caring',
    description: 'Like a wise family member',
    emoji: '🤗',
  },
  {
    value: 'fun',
    label: 'Fun & Silly',
    description: 'Jokes, emojis, laughs',
    emoji: '😂',
  },
  {
    value: 'sarcastic',
    label: 'Sarcastic',
    description: 'Dry, witty commentary',
    emoji: '🙄',
  },
  {
    value: 'dramatic',
    label: 'Dramatic',
    description: 'Over-the-top theatrical',
    emoji: '🎭',
  },
]

export default function SetupPage() {
  const router = useRouter()
  const [parties, setParties] = useState<string[]>(['', ''])
  const [relationship, setRelationship] = useState<Relationship>('Friends')
  const [tone, setTone] = useState<Tone>('serious')
  const [language, setLanguage] = useState<Language>('english')

  const addParty = () => {
    if (parties.length < 4) setParties([...parties, ''])
  }

  const removeParty = (index: number) => {
    if (parties.length <= 2) return
    setParties(parties.filter((_, i) => i !== index))
  }

  const updateParty = (index: number, value: string) => {
    const updated = [...parties]
    updated[index] = value
    setParties(updated)
  }

  const canStart = parties.every(p => p.trim().length > 0) && relationship && tone

  const handleStart = () => {
    if (!canStart) return
    const params = new URLSearchParams({
      parties: JSON.stringify(parties.map(p => p.trim())),
      relationship,
      tone,
      language,
    })
    router.push(`/record?${params.toString()}`)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-8">
        {/* Intro */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-white">
            Present Your Case
          </h2>
          <p className="text-navy-300 text-base">
            Set up the dispute details, then let both parties speak their truth.
          </p>
        </div>

        {/* Parties */}
        <div className="card space-y-4">
          <div className="section-label">The Parties Involved</div>
          <div className="space-y-3">
            {parties.map((party, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    className="input-field pr-12"
                    placeholder={`Person ${i + 1} name (e.g. ${['Mike', 'Linda', 'Sam', 'Jordan'][i]})`}
                    value={party}
                    onChange={e => updateParty(i, e.target.value)}
                    maxLength={30}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-400 text-sm">
                    #{i + 1}
                  </span>
                </div>
                {parties.length > 2 && (
                  <button
                    onClick={() => removeParty(i)}
                    className="text-navy-400 hover:text-red-400 transition-colors p-2"
                    aria-label="Remove person"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          {parties.length < 4 && (
            <button
              onClick={addParty}
              className="flex items-center gap-2 text-gold-400 hover:text-gold-300 text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Another Person
            </button>
          )}
        </div>

        {/* Relationship Type */}
        <div className="card space-y-4">
          <div className="section-label">Relationship Type</div>
          <div className="flex flex-wrap gap-2">
            {RELATIONSHIPS.map(rel => (
              <button
                key={rel}
                onClick={() => setRelationship(rel)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                  relationship === rel
                    ? 'bg-gold-500 border-gold-500 text-navy-950 font-bold shadow-lg shadow-gold-500/20'
                    : 'bg-navy-800 border-navy-600 text-navy-200 hover:border-gold-600/50 hover:text-white'
                }`}
              >
                {rel}
              </button>
            ))}
          </div>
        </div>

        {/* Language */}
        <div className="card space-y-4">
          <div className="section-label">Language</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {LANGUAGES.map(l => (
              <button
                key={l.value}
                onClick={() => setLanguage(l.value)}
                className={`flex flex-col gap-2 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  language === l.value
                    ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                    : 'border-navy-700 bg-navy-800/50 hover:border-navy-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{l.emoji}</span>
                  {l.badge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {l.badge}
                    </span>
                  )}
                </div>
                <div>
                  <p className={`font-semibold text-sm ${language === l.value ? 'text-gold-300' : 'text-white'}`}>
                    {l.label}
                  </p>
                  <p className="text-navy-400 text-xs mt-0.5">{l.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Verdict Tone */}
        <div className="card space-y-4">
          <div className="section-label">Verdict Tone</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TONES.map(t => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                  tone === t.value
                    ? 'border-gold-500 bg-gold-500/10 shadow-lg shadow-gold-500/10'
                    : 'border-navy-700 bg-navy-800/50 hover:border-navy-500'
                }`}
              >
                <span className="text-2xl flex-shrink-0">{t.emoji}</span>
                <div>
                  <p className={`font-semibold text-sm ${tone === t.value ? 'text-gold-300' : 'text-white'}`}>
                    {t.label}
                  </p>
                  <p className="text-navy-400 text-xs">{t.description}</p>
                </div>
                {tone === t.value && (
                  <svg className="w-4 h-4 text-gold-400 ml-auto flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <div className="pb-8">
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="btn-primary w-full flex items-center justify-center gap-3 text-xl py-4"
          >
            <span>🎙️</span>
            Start Recording
          </button>
          {!canStart && (
            <p className="text-center text-navy-400 text-sm mt-2">
              Enter all party names to continue
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
