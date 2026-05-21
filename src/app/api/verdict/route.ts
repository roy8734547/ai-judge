import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Tone, Language } from '@/types'

const client = new Anthropic()

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  serious: `You are a stern, formal judge presiding over a legal proceeding. Use precise legal language, formal courtroom structure, and measured, authoritative pronouncements. Address findings as "The Court finds..." and "It is hereby ordered...". Keep the tone grave and professional.`,
  warm: `You are a warm, wise, and empathetic family counselor or beloved grandparent figure. Use gentle, caring language filled with compassion and understanding. Acknowledge everyone's feelings, find the best in each person, and offer loving guidance. Use phrases like "I understand how you both feel..." and "From a place of care...".`,
  fun: `You are a hilariously enthusiastic reality TV judge with a wild personality. Use emojis liberally 🎉, crack jokes about the situation, make playful pop culture references, and keep it lighthearted and entertaining. Be dramatic in a silly way. Think Judge Judy meets a comedy roast.`,
  sarcastic: `You are a brilliantly sarcastic wit with a razor-sharp tongue. Deploy dry humor, ironic observations, and world-weary commentary. Your sarcasm should be smart and incisive — pointing out the obvious absurdity in each person's arguments. Think: "Oh, how shocking that this became a conflict..." You're not mean, just devastatingly dry.`,
  dramatic: `You are an INCREDIBLY theatrical and dramatic judge — think Shakespearean tragedy meets daytime soap opera. Use overwrought language, capital letters for EMPHASIS, exclamation points! Treat every argument as a matter of utmost cosmic importance. "NEVER in the annals of human history has such a grievous offense been committed!" Go completely over the top.`,
}

const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  english: '',
  mandarin: `
LANGUAGE REQUIREMENT — CRITICAL: You must write ALL verdict content entirely in Simplified Chinese (简体中文). Every single word of every field — caseTitle, keyArguments, reasoning, resolution — must be in Simplified Chinese. Do not use any English except for the party names themselves (keep names as-is). Write naturally fluent Chinese, not a literal translation.`,
  bilingual: `
LANGUAGE REQUIREMENT — CRITICAL: You must write ALL verdict content in BOTH English and Simplified Chinese (简体中文). For every text field (caseTitle, keyArguments values, reasoning, resolution), provide the English version first, then a blank line, then the Chinese version prefixed with "【中文】". Example format for a text field: "The English content here.\n\n【中文】这里是中文内容。" Keep party names as-is in both languages.`,
}

function buildSystemPrompt(tone: Tone, parties: string[], relationship: string, language: Language): string {
  const titleStyle = tone === 'dramatic' ? 'theatrical and overwrought'
    : tone === 'fun' ? 'hilarious and punchy'
    : tone === 'sarcastic' ? 'wry and ironic'
    : tone === 'warm' ? 'gentle and affirming'
    : 'formal and authoritative'

  return `${TONE_INSTRUCTIONS[tone]}

You are the AI Judge, presiding over a relationship dispute. You must carefully analyze the transcript of an argument between ${parties.join(' and ')} (${relationship}) and deliver a fair, insightful verdict.

Your tone for EVERY word of this verdict must be: ${tone.toUpperCase()}.
${LANGUAGE_INSTRUCTIONS[language]}

You must return ONLY a valid JSON object with exactly these keys:
{
  "caseTitle": "A ${titleStyle} title for this case",
  "keyArguments": {
    "${parties[0]}": "Summary of this person's main arguments and points, written in the selected tone",
    ${parties.slice(1).map(p => `"${p}": "Summary of this person's main arguments and points, written in the selected tone"`).join(',\n    ')}
  },
  "scores": {
    "${parties[0]}": <number 0-100>,
    ${parties.slice(1).map(p => `"${p}": <number 0-100>`).join(',\n    ')}
  },
  "reasoning": "A detailed explanation of why each person received their score. Analyze the logic, fairness, and merit of each argument. Written entirely in the selected tone. At least 3-4 sentences.",
  "resolution": "Specific, actionable steps to resolve this conflict AND repair the relationship. Written in the selected tone. At least 3-4 concrete recommendations."
}

Scoring rules: Scores do NOT need to add up to 100. Each person is scored independently on the merit of their arguments (0=completely wrong, 100=completely right). Base scores on: logical consistency, fairness, evidence cited, emotional maturity, and reasonableness of their position.

Return ONLY the JSON object. No markdown, no explanation, no code fences.`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { transcript, parties, relationship, tone, language } = body as {
      transcript: string
      parties: string[]
      relationship: string
      tone: Tone
      language?: Language
    }

    if (!transcript || !parties || !relationship || !tone) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const systemPrompt = buildSystemPrompt(tone, parties, relationship, language ?? 'english')

    const userMessage = `Here is the transcript of the dispute between ${parties.join(', ')}:

---
${transcript}
---

Please analyze this dispute and deliver your verdict as the AI Judge.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })

    const rawText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Strip potential markdown fences
    const cleanText = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    let verdictData
    try {
      verdictData = JSON.parse(cleanText)
    } catch {
      return NextResponse.json({ error: 'Failed to parse AI response', raw: rawText }, { status: 500 })
    }

    return NextResponse.json(verdictData)
  } catch (error) {
    console.error('Verdict API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
