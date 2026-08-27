export type HealthStatus = { status: 'ok' }
export type PublicConfig = { application_name: string; kiosk_mode: boolean }
export type TrustState = 'current' | 'stale'
export type ProcedureSummary = {
  service_id: string
  title: string
  short_description: string
  category: string
  interaction_modes: Array<'online' | 'in_person'>
  official_publisher: string
  pack_version: string
  last_verified_at: string
  review_due_at: string
  trust_state: TrustState
}
export type CitedFact = { fact_id: string; text: string; source_ids: string[] }
export type DocumentGuidance = { document_id: string; name: string; guidance: string; source_ids: string[] }
export type FeeInformation = { amount: string | null; currency: string; statement: string; qualifiers: string[]; source_ids: string[] }
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
  limitations: CitedFact[]
}
const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
async function getJson<T>(path: string): Promise<T> { const response = await fetch(`${apiBase}${path}`, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('Service unavailable'); return response.json() as Promise<T> }
export const getHealth = () => getJson<HealthStatus>('/health')
export const getPublicConfig = () => getJson<PublicConfig>('/public-config')
export const getProcedures = () => getJson<{ procedures: ProcedureSummary[] }>('/procedures')
export const getProcedure = (serviceId: string) => getJson<ProcedureDetail>(`/procedures/${encodeURIComponent(serviceId)}`)
