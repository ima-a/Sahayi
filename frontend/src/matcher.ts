import type { ProcedureSummary } from './api'

export const MAX_QUERY_LENGTH = 500
const MAX_CATALOGUE_CANDIDATES = 100

// These are intentionally few and English-only. Service terms are never stop words.
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'for', 'i', 'in', 'is', 'it', 'my', 'of', 'or', 'the', 'to', 'want', 'with'])

export type MatchReason = 'exact_phrase' | 'phrase_containment' | 'token_overlap'
export type Candidate = { procedure: ProcedureSummary; score: number; reason: MatchReason; matched_tokens: string[] }
export type MatchResult =
  | { kind: 'confident'; candidate: Candidate }
  | { kind: 'ambiguous'; candidates: Candidate[] }
  | { kind: 'none' }

export function normalise(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}

export function meaningfulTokens(text: string): string[] {
  return normalise(text).split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token))
}

export function detectHighRiskPii(text: string): boolean {
  const compactDigits = text.replace(/[\s-]/g, '')
  const hasAadhaarLike = /(?<!\d)\d{12}(?!\d)/.test(compactDigits)
  const hasPhoneLike = /(?<!\d)\d{10}(?!\d)/.test(compactDigits)
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)
  return hasAadhaarLike || hasPhoneLike || hasEmail
}

export function matchProcedures(query: string, procedures: ProcedureSummary[]): MatchResult {
  const boundedProcedures = procedures.slice(0, MAX_CATALOGUE_CANDIDATES)
  if (!query.trim() || query.length > MAX_QUERY_LENGTH || boundedProcedures.length === 0) return { kind: 'none' }
  const queryNormalised = normalise(query)
  const queryTokens = new Set(meaningfulTokens(query))
  if (!queryNormalised || queryTokens.size === 0) return { kind: 'none' }

  const frequency = new Map<string, number>()
  for (const procedure of boundedProcedures) for (const phrase of procedure.intent_phrases) {
    for (const token of new Set(meaningfulTokens(phrase))) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  }
  const candidates = boundedProcedures.map(procedure => scoreProcedure(procedure, queryNormalised, queryTokens, frequency, boundedProcedures.length))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.score - left.score || left.procedure.service_id.localeCompare(right.procedure.service_id))
  if (candidates.length === 0 || candidates[0].score < 260) return { kind: 'none' }
  const first = candidates[0]
  const second = candidates[1]
  if (second && first.score - second.score < 70) return { kind: 'ambiguous', candidates: candidates.slice(0, 3) }
  return { kind: 'confident', candidate: first }
}

function scoreProcedure(procedure: ProcedureSummary, query: string, queryTokens: Set<string>, frequency: Map<string, number>, total: number): Candidate | null {
  let best: Candidate | null = null
  for (const phrase of procedure.intent_phrases) {
    const normalisedPhrase = normalise(phrase)
    const phraseTokens = [...new Set(meaningfulTokens(phrase))]
    if (!normalisedPhrase || phraseTokens.length === 0) continue
    const matchedTokens = phraseTokens.filter(token => queryTokens.has(token))
    const totalWeight = phraseTokens.reduce((sum, token) => sum + tokenWeight(token, frequency, total), 0)
    const matchedWeight = matchedTokens.reduce((sum, token) => sum + tokenWeight(token, frequency, total), 0)
    let score = totalWeight ? Math.round((matchedWeight / totalWeight) * 400) : 0
    let reason: MatchReason = 'token_overlap'
    if (query === normalisedPhrase) { score += 1000; reason = 'exact_phrase' }
    else if (query.includes(normalisedPhrase)) { score += 700; reason = 'phrase_containment' }
    else if (matchedTokens.length === phraseTokens.length) { score += 300; reason = 'token_overlap' }
    const candidate = { procedure, score, reason, matched_tokens: matchedTokens }
    if (!best || candidate.score > best.score) best = candidate
  }
  return best
}

function tokenWeight(token: string, frequency: Map<string, number>, total: number): number {
  return 1 + Math.log((total + 1) / ((frequency.get(token) ?? 0) + 1))
}
