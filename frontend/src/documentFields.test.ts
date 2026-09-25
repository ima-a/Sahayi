import { expect, it } from 'vitest'
import { extractFieldClues } from './documentEvidence'
const fields = [{ field_id: 'new-address', label: 'Address', input_type: 'textarea', maximum_length: 400 }]
it('proposes only bounded known field clues without accepting OCR as authoritative', () => {
  expect(extractFieldClues('Address: SYNTHETIC TEST LANE', 90, fields)[0].value).toBe('SYNTHETIC TEST LANE')
  expect(extractFieldClues('Address: SYNTHETIC TEST LANE', 40, fields)).toEqual([])
  expect(extractFieldClues('Address: 0000 0000 0000', 90, fields)).toEqual([])
  expect(extractFieldClues('Name: SYNTHETIC CITIZEN', 90, fields)).toEqual([])
})
