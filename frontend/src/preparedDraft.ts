import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { SyntheticFormAssistance, PersonalizedChecklist } from './api'

export type ConfirmedValue = { value: string; source: string; confirmed: boolean; valid: boolean }
export type DraftRow = { label: string; value: string; source: string }
export const WORKSHEET_WATERMARK = 'DEMO — NOT FOR SUBMISSION'
export const DRAFT_WATERMARK = 'PREPARED DRAFT — REVIEW BEFORE SUBMISSION'

export function mapConfirmedFields(sheet: SyntheticFormAssistance, values: Record<string, ConfirmedValue>): DraftRow[] {
  return sheet.fields.filter(field => field.may_appear_on_sheet !== false).map(field => {
    const value = values[field.field_id]
    const allowed = field.input_type !== 'not_collected' && value?.confirmed && value.valid
      && field.supported_value_sources?.includes(value.source as never)
    return { label: field.label, value: allowed ? value.value.slice(0, field.maximum_length ?? 500) : '—', source: allowed ? value.source : 'blank' }
  })
}

// Canvas text uses the browser's Indic shaping and installed fonts; no remote font request.
// English stays searchable; non-Latin lines are embedded as local raster images.
export async function generateWorksheet(sheet: SyntheticFormAssistance, values: Record<string, ConfirmedValue>, checklist: PersonalizedChecklist | null, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  let page = pdf.addPage([595.28, 841.89])
  let y = 800
  const line = async (text: string, size = 11) => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if (y < 45) { page = pdf.addPage([595.28, 841.89]); y = 800; page.drawText(WORKSHEET_WATERMARK, { x: 40, y, size: 11, font }); y -= 28 }
    if (/^[\x20-\x7E\u2014]*$/.test(text)) page.drawText(text, { x: 40, y, size, font, color: rgb(0.1, 0.1, 0.1) })
    else {
      const canvas = document.createElement('canvas')
      canvas.width = 1030; canvas.height = 52
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('local-font-rendering-unavailable')
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#191919'; ctx.font = `${size * 2}px sans-serif`; ctx.textBaseline = 'top'
      if (ctx.measureText(text).width > 1030) throw new Error('line-too-wide')
      ctx.fillText(text, 0, 4)
      try { const png = await pdf.embedPng(canvas.toDataURL('image/png')); page.drawImage(png, { x: 40, y: y - 10, width: 515, height: 26 }) }
      finally { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.width = 0; canvas.height = 0 }
    }
    y -= 26
  }
  const paragraph = async (text: string, size = 11) => {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.replace(/[\r\n\t]+/g, ' '))].map(item => item.segment)
    const unicode = /[^\x20-\x7E\u2014]/.test(text)
    const canvas = unicode ? document.createElement('canvas') : null
    const ctx = canvas?.getContext('2d')
    if (unicode && !ctx) throw new Error('local-font-rendering-unavailable')
    if (ctx) ctx.font = `${size}px sans-serif`
    let current = ''
    const lines: string[] = []
    for (const segment of segments) {
      const next = current + segment
      const width = ctx ? ctx.measureText(next).width : font.widthOfTextAtSize(next, size)
      if (width > 500 && current) { lines.push(current); current = segment } else current = next
    }
    if (current) lines.push(current)
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    for (const textLine of lines) await line(textLine, size)
  }
  await line(WORKSHEET_WATERMARK, 13)
  await paragraph(sheet.title, 13)
  await paragraph(sheet.privacy_notice)
  for (const row of mapConfirmedFields(sheet, values)) {
    await paragraph(row.label)
    await paragraph(row.value)
    const provenance: Record<string, string> = { citizen_confirmed_local_answer: 'Confirmed by you', citizen_confirmed_local_ocr_suggestion: 'Document clue confirmed by you', deterministic_derived_value: 'From your readiness answer', blank: 'Left blank' }
    await paragraph(provenance[row.source] ?? 'Requires review', 9)
  }
  if (checklist) {
    await paragraph(checklist.result.text)
    for (const item of [...checklist.ready, ...checklist.confirm, ...checklist.steps]) await paragraph(item.text)
    for (const item of checklist.documents) await paragraph(`${item.name}: ${item.guidance}`)
  }
  await paragraph(sheet.disclaimer)
  return new Uint8Array(await pdf.save())
}

export type ReviewedPdfManifest = {
  sha256: string; output: 'acroform' | 'overlay'; page_count: number
  fields: Array<{ field_id: string; pdf_field?: string; page?: number; rectangle?: [number, number, number, number]; maximum_length: number; leave_blank: boolean; signature_or_attestation: boolean }>
  protected_fields: string[]
  watermark_positions: Array<[number, number, number, number, number]>
}

// Only immutable, registry-reviewed templates may call this function in production.
// No official templates are activated in the initial registry.
export async function fillReviewedPdf(source: Uint8Array<ArrayBuffer>, manifest: ReviewedPdfManifest, values: Record<string, ConfirmedValue>) {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source))).map(x => x.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.sha256) throw new Error('template-checksum')
  const pdf = await PDFDocument.load(source.slice(), { updateMetadata: false })
  if (pdf.getPageCount() !== manifest.page_count) throw new Error('template-pages')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (const field of manifest.fields) {
    const value = values[field.field_id]
    if (field.leave_blank || field.signature_or_attestation || manifest.protected_fields.includes(field.pdf_field ?? field.field_id)) continue
    if (!value?.confirmed || !value.valid) continue
    if (value.value.length > field.maximum_length || !/^[\x20-\x7E]*$/.test(value.value)) throw new Error('requires-worksheet')
    if (manifest.output === 'acroform') {
      if (!field.pdf_field) throw new Error('unreviewed-field')
      const target = pdf.getForm().getTextField(field.pdf_field)
      if (target.acroField.getWidgets().some(widget => { const box = widget.getRectangle(); return font.widthOfTextAtSize(value.value, 10) > box.width - 4 || box.height < 14 })) throw new Error('field-overflow')
      target.setText(value.value)
      target.setFontSize(10)
    } else {
      if (field.page === undefined || !field.rectangle) throw new Error('unreviewed-overlay')
      const page = pdf.getPage(field.page)
      const [x, y, width, height] = field.rectangle
      if (Math.min(x, y) < 0 || Math.min(width, height) <= 0 || x + width > page.getWidth() || y + height > page.getHeight() || font.widthOfTextAtSize(value.value, 10) > width || height < 12) throw new Error('overlay-overflow')
      page.drawText(value.value, { x, y, size: 10, font })
    }
  }
  if (manifest.watermark_positions.length !== pdf.getPageCount() || new Set(manifest.watermark_positions.map(p => p[0])).size !== pdf.getPageCount()) throw new Error('unreviewed-watermark')
  for (const [index, x, y, width, height] of manifest.watermark_positions) {
    const page = pdf.getPage(index)
    if (Math.min(x, y) < 0 || x + width > page.getWidth() || y + height > page.getHeight() || font.widthOfTextAtSize(DRAFT_WATERMARK, 8) > width || height < 10) throw new Error('watermark-overflow')
    page.drawText(DRAFT_WATERMARK, { x, y, size: 8, font })
  }
  return new Uint8Array(await pdf.save())
}
