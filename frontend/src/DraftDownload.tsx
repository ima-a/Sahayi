import { useEffect, useState } from 'react'
import type { PersonalizedChecklist, SyntheticFormAssistance } from './api'
import type { ConfirmedValue } from './preparedDraft'
import type { Locale } from './i18n'

const COPY = {
  en: { confirm: 'I reviewed these fields', download: 'Download preparation sheet', working: 'Preparing PDF on this device…', error: 'PDF could not be prepared. You can print the reviewed sheet.', fallback: 'No reviewed official PDF mapping is registered for this service. This preparation sheet is not a government application.', print: 'Print reviewed sheet' },
  hi: { confirm: 'मैंने इन फ़ील्ड की समीक्षा की है', download: 'तैयारी शीट डाउनलोड करें', working: 'इस डिवाइस पर PDF तैयार हो रहा है…', error: 'PDF तैयार नहीं हुआ। समीक्षा की गई शीट प्रिंट कर सकते हैं।', fallback: 'इस सेवा के लिए समीक्षा किया गया आधिकारिक PDF मानचित्र पंजीकृत नहीं है। यह तैयारी शीट सरकारी आवेदन नहीं है।', print: 'समीक्षा की गई शीट प्रिंट करें' },
  ml: { confirm: 'ഈ ഫീൽഡുകൾ ഞാൻ പരിശോധിച്ചു', download: 'തയ്യാറെടുപ്പ് ഷീറ്റ് ഡൗൺലോഡ് ചെയ്യുക', working: 'ഈ ഉപകരണത്തിൽ PDF തയ്യാറാക്കുന്നു…', error: 'PDF തയ്യാറാക്കാനായില്ല. പരിശോധിച്ച ഷീറ്റ് പ്രിന്റ് ചെയ്യാം.', fallback: 'ഈ സേവനത്തിന് അവലോകനം ചെയ്ത ഔദ്യോഗിക PDF മാപ്പിംഗ് രജിസ്റ്റർ ചെയ്തിട്ടില്ല. ഈ തയ്യാറെടുപ്പ് ഷീറ്റ് സർക്കാർ അപേക്ഷയല്ല.', print: 'പരിശോധിച്ച ഷീറ്റ് പ്രിന്റ് ചെയ്യുക' },
}
export function DraftDownload({ sheet, values, checklist, locale, onReview }: { sheet: SyntheticFormAssistance; values: Record<string, ConfirmedValue>; checklist: PersonalizedChecklist | null; locale: Locale; onReview?: (reviewed: boolean) => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const copy = COPY[locale]
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let generatedUrl: string | null = null
    let bytes: Uint8Array<ArrayBuffer> | null = null
    // Synchronize the visible download and review state with this newly generated artifact.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(null); setError(false); setReviewed(false); onReview?.(false)
    void import('./preparedDraft').then(module => module.generateWorksheet(sheet, values, checklist, controller.signal)).then(result => {
      if (!active) { result.fill(0); return }
      bytes = result
      generatedUrl = URL.createObjectURL(new Blob([result], { type: 'application/pdf' }))
      setUrl(generatedUrl)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false; controller.abort(); bytes?.fill(0); if (generatedUrl) URL.revokeObjectURL(generatedUrl) }
  }, [sheet, values, checklist, locale, onReview])
  return <div className="draft-download no-print"><p>{copy.fallback}</p>
    <label><input type="checkbox" checked={reviewed} onChange={event => { setReviewed(event.target.checked); onReview?.(event.target.checked) }} />{copy.confirm}</label>
    {error ? <p role="status">{copy.error}</p> : !url ? <p role="status">{copy.working}</p> : reviewed && <a className="official-handoff" href={url} download="sahayi-preparation.pdf">{copy.download}</a>}
    <button type="button" className="secondary compact" disabled={!reviewed} onClick={() => window.print()}>{copy.print}</button>
  </div>
}
