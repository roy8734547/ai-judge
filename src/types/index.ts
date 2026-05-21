export type Tone = 'serious' | 'warm' | 'fun' | 'sarcastic' | 'dramatic'
export type Relationship =
  | 'Spouse/Partner'
  | 'Parent & Child'
  | 'Siblings'
  | 'Friends'
  | 'Coworkers'
  | 'Neighbors'
  | 'Other'
export type Language = 'english' | 'mandarin' | 'bilingual'

export interface CaseSetup {
  parties: string[]
  relationship: Relationship
  tone: Tone
  language: Language
}

export interface TranscriptLine {
  speaker: string
  text: string
}

export interface VerdictData {
  caseTitle: string
  keyArguments: Record<string, string>
  scores: Record<string, number>
  reasoning: string
  resolution: string
}
