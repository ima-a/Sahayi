import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { fillReviewedPdf, generateWorksheet, mapConfirmedFields, type ReviewedPdfManifest } from './preparedDraft'
import type { SyntheticFormAssistance } from './api'

const value = { value: 'SYNTHETIC CITIZEN', confirmed: true, valid: true, source: 'citizen_confirmed_local_answer' }
const field = { field_id: 'applicant-name', label: 'Name', input_type: 'text', maximum_length: 120, supported_value_sources: ['citizen_confirmed_local_answer'], may_appear_on_sheet: true }
const sheet = { title: 'Synthetic preparation', privacy_notice: 'Local only', disclaimer: 'Not an application', fields: [field, { ...field, field_id: 'signature', input_type: 'not_collected' }] } as SyntheticFormAssistance
const sha = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('')

describe('browser-local draft generation', () => {
  it('maps only confirmed allowlisted values and keeps protected fields blank', () => {
    expect(mapConfirmedFields(sheet, { 'applicant-name': value, signature: value })).toEqual([{ label: 'Name', value: value.value, source: value.source }, { label: 'Name', value: '—', source: 'blank' }])
    expect(mapConfirmedFields(sheet, { 'applicant-name': { ...value, confirmed: false } })[0].value).toBe('—')
    expect(mapConfirmedFields(sheet, { 'applicant-name': { ...value, source: 'provider' } })[0].value).toBe('—')
  })
  it('generates a bounded A4 worksheet without network access', async () => {
    const bytes = await generateWorksheet(sheet, { 'applicant-name': value }, null)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
  it('fills a reviewed synthetic AcroForm copy, preserving protected fields and source bytes', async () => {
    const original = await PDFDocument.create(); const page = original.addPage()
    for (const name of ['name', 'signature']) original.getForm().createTextField(name).addToPage(page, { x: 50, y: name === 'name' ? 700 : 600, width: 200, height: 25 })
    const bytes = new Uint8Array(await original.save()); const before = bytes.slice()
    const manifest: ReviewedPdfManifest = { output: 'acroform', sha256: await sha(bytes), page_count: 1, watermark_positions: [[0, 20, 12, 400, 12]], protected_fields: ['signature'], fields: [
      { field_id: 'applicant-name', pdf_field: 'name', maximum_length: 120, leave_blank: false, signature_or_attestation: false },
      { field_id: 'signature', pdf_field: 'signature', maximum_length: 120, leave_blank: false, signature_or_attestation: true },
    ] }
    const pdf = await PDFDocument.load(await fillReviewedPdf(bytes, manifest, { 'applicant-name': value, signature: value }))
    expect(pdf.getForm().getTextField('name').getText()).toBe(value.value)
    expect(pdf.getForm().getTextField('signature').getText()).toBeUndefined()
    expect(bytes).toEqual(before)
    await expect(fillReviewedPdf(bytes, { ...manifest, sha256: '0'.repeat(64) }, {})).rejects.toThrow('template-checksum')
  })
  it('fills only reviewed overlay rectangles and refuses overflow or unsupported scripts', async () => {
    const original = await PDFDocument.create(); original.addPage([595.28, 841.89])
    const bytes = new Uint8Array(await original.save())
    const manifest: ReviewedPdfManifest = { output: 'overlay', sha256: await sha(bytes), page_count: 1, watermark_positions: [[0, 20, 12, 400, 12]], protected_fields: [], fields: [{ field_id: 'applicant-name', page: 0, rectangle: [50, 600, 250, 20], maximum_length: 120, leave_blank: false, signature_or_attestation: false }] }
    expect((await PDFDocument.load(await fillReviewedPdf(bytes, manifest, { 'applicant-name': value }))).getPageCount()).toBe(1)
    await expect(fillReviewedPdf(bytes, manifest, { 'applicant-name': { ...value, value: 'W'.repeat(100) } })).rejects.toThrow('overlay-overflow')
    await expect(fillReviewedPdf(bytes, manifest, { 'applicant-name': { ...value, value: 'मॉडल' } })).rejects.toThrow('requires-worksheet')
  })
})
