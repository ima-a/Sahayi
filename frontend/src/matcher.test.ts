import { describe, expect, it } from 'vitest'
import type { ProcedureSummary } from './api'
import { detectHighRiskPii, matchProcedures, meaningfulTokens, normalise } from './matcher'

const aadhaar: ProcedureSummary = { service_id: 'one', title: 'Aadhaar address', short_description: 'Address help', intent_phrases: ['update Aadhaar address'], category: 'identity', trust_state: 'current', attention_required: false }
const pension: ProcedureSummary = { service_id: 'two', title: 'Kerala pension', short_description: 'Pension help', intent_phrases: ['old age pension Kerala'], category: 'pension', trust_state: 'current', attention_required: false }

describe('pack-driven local matcher', () => {
  it('normalises punctuation, whitespace, and Unicode safely', () => {
    expect(normalise('  UPDATE\u00a0Aadhaar—ADDRESS! ')).toBe('update aadhaar address')
    expect(meaningfulTokens('I want to update my Aadhaar address')).toEqual(['update', 'aadhaar', 'address'])
  })
  it('recognises exact phrases and containment', () => {
    expect(matchProcedures('update Aadhaar address', [aadhaar, pension])).toMatchObject({ kind: 'confident', candidate: { procedure: { service_id: 'one' }, reason: 'exact_phrase' } })
    expect(matchProcedures('I moved recently and need to update Aadhaar address.', [aadhaar, pension])).toMatchObject({ kind: 'confident', candidate: { procedure: { service_id: 'one' }, reason: 'phrase_containment' } })
  })
  it('uses token overlap for reordered natural language', () => {
    expect(matchProcedures('I want to apply for pension in Kerala at old age', [aadhaar, pension])).toMatchObject({ kind: 'confident', candidate: { procedure: { service_id: 'two' }, reason: 'token_overlap' } })
  })
  it('returns no result below the threshold or for empty and oversized input', () => {
    expect(matchProcedures('something unrelated', [aadhaar, pension])).toEqual({ kind: 'none' })
    expect(matchProcedures('   ', [aadhaar])).toEqual({ kind: 'none' })
    expect(matchProcedures('a'.repeat(501), [aadhaar])).toEqual({ kind: 'none' })
  })
  it('uses a minimum margin and reports ambiguity', () => {
    const first = { ...aadhaar, intent_phrases: ['address update'] }
    const second = { ...pension, intent_phrases: ['address update'] }
    expect(matchProcedures('address update', [first, second])).toMatchObject({ kind: 'ambiguous' })
  })
  it('is driven by authored phrases rather than service IDs', () => {
    const renamed = { ...aadhaar, service_id: 'entirely-different-id', intent_phrases: ['licence renewal'] }
    expect(matchProcedures('licence renewal', [renamed])).toMatchObject({ kind: 'confident', candidate: { procedure: { service_id: 'entirely-different-id' } } })
  })
  it('detects obvious high-risk identifiers locally', () => {
    expect(detectHighRiskPii('1234 5678 9012')).toBe(true)
    expect(detectHighRiskPii('9876543210')).toBe(true)
    expect(detectHighRiskPii('person@example.in')).toBe(true)
    expect(detectHighRiskPii('update my Aadhaar address')).toBe(false)
  })
  it('treats HTML-like text as plain input', () => {
    expect(matchProcedures('<script>update Aadhaar address</script>', [aadhaar])).toMatchObject({ kind: 'confident', candidate: { procedure: { service_id: 'one' } } })
  })
})
