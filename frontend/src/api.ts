export type HealthStatus = { status: 'ok' }
export type PublicConfig = { application_name: string; kiosk_mode: boolean }
export type TrustState = 'current' | 'stale'
export type FeeVerificationStatus = 'confirmed' | 'conflicting' | 'free' | 'not_stated'
export type ProcedureSummary = {
  service_id: string
  title: string
  short_description: string
  intent_phrases: string[]
  category: string
  trust_state: TrustState
  attention_required: boolean
}
export type CitedFact = { fact_id: string; text: string; source_ids: string[] }
export type DocumentGuidance = { document_id: string; name: string; guidance: string; source_ids: string[] }
export type FeeClaim = { amount: string; currency: string; qualifier: string; source_ids: string[] }
export type FeeInformation = {
  verification_status: FeeVerificationStatus
  amount: string | null
  currency: string | null
  display_message: string
  claims: FeeClaim[]
  resolution_guidance: string | null
  source_ids: string[]
}
export type ProcedureStep = { step_id: string; order: number; title: string; instruction: string; source_ids: string[] }
export type ProcedureSource = {
  source_id: string
  publisher: string
  title: string
  url: string
  retrieved_at: string
  official_updated_date: string | null
  sha256: string | null
  source_type: 'webpage' | 'pdf'
}
export type ProcedureDetail = {
  service_id: string
  title: string
  short_description: string
  category: string
  jurisdiction: { level: 'national' | 'state' | 'local'; name: string }
  department: string
  official_publisher: string
  interaction_modes: Array<'online' | 'in_person'>
  requirements: CitedFact[]
  required_documents: DocumentGuidance[]
  fee: FeeInformation
  steps: ProcedureStep[]
  submission_channels: Array<{ channel_id: string; mode: 'online' | 'in_person'; name: string; guidance: string; source_ids: string[] }>
  official_handoff_url: string
  tracking_guidance: CitedFact | null
  sources: ProcedureSource[]
  provenance: Record<string, string[]>
  pack_version: string
  pack_digest: string
  last_verified_at: string
  review_due_at: string
  trust_state: TrustState
  attention_required: boolean
  limitations: CitedFact[]
  additional_review_items: CitedFact[]
}
export type ReadinessAnswer = boolean | number | string
export type ReadinessQuestion = {
  question_id: string
  prompt: string
  help_text: string | null
  answer_type: 'boolean' | 'single_choice' | 'integer'
  options: Array<{ option_id: string; label: string }> | null
  minimum: number | null
  maximum: number | null
  required: boolean
  sensitivity: 'non_sensitive' | 'sensitive'
}
export type ReadinessResponse = {
  pack_version: string
  pack_digest: string
  evaluation_status: 'incomplete' | 'ready' | 'alternative_path' | 'needs_information' | 'cannot_confirm'
  complete: boolean
  progress: { answered: number; total: number }
  next_question: ReadinessQuestion | null
  outcome: { outcome_id: string; status: 'ready' | 'alternative_path' | 'needs_information' | 'cannot_confirm'; title: string; explanation: string } | null
  reason_trace: Array<{ trace_type: 'question' | 'rule' | 'outcome' | 'default'; trace_id: string; source_ids: string[] }>
  sources: ProcedureSource[]
  recommended_next_steps: string[]
  official_handoff_url: string | null
  disclaimer: string
}
const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
async function getJson<T>(path: string): Promise<T> { const response = await fetch(`${apiBase}${path}`, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('Service unavailable'); return response.json() as Promise<T> }
async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error('Service unavailable')
  return response.json() as Promise<T>
}
export const getHealth = () => getJson<HealthStatus>('/health')
export const getPublicConfig = () => getJson<PublicConfig>('/public-config')
export const getProcedures = () => getJson<{ procedures: ProcedureSummary[] }>('/procedures')
export const getProcedure = (serviceId: string) => getJson<ProcedureDetail>(`/procedures/${encodeURIComponent(serviceId)}`)
export const evaluateReadiness = (serviceId: string, answers: Record<string, ReadinessAnswer>) =>
  postJson<ReadinessResponse>(`/procedures/${encodeURIComponent(serviceId)}/readiness/evaluate`, { answers })
