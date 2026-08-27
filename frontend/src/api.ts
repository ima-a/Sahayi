export type HealthStatus = { status: 'ok' }
export type PublicConfig = { application_name: string; kiosk_mode: boolean }
const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'
async function getJson<T>(path: string): Promise<T> { const response = await fetch(`${apiBase}${path}`, { headers: { Accept: 'application/json' } }); if (!response.ok) throw new Error('Service unavailable'); return response.json() as Promise<T> }
export const getHealth = () => getJson<HealthStatus>('/health')
export const getPublicConfig = () => getJson<PublicConfig>('/public-config')
