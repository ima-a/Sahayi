import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ProcedureDetail, ProcedureSummary } from './api'

const summary: ProcedureSummary = {
  service_id: 'uidai-aadhaar-address-update',
  title: 'Update your Aadhaar address online',
  short_description: 'Official UIDAI guidance for requesting an address update through the MyAadhaar portal.',
  category: 'identity-documents', interaction_modes: ['online'], official_publisher: 'Unique Identification Authority of India',
  pack_version: '1.0.0', last_verified_at: '2026-08-28T00:00:00+05:30', review_due_at: '2026-11-28T00:00:00+05:30', trust_state: 'current',
}

const detail: ProcedureDetail = {
  ...summary,
  jurisdiction: { level: 'national', name: 'India' }, department: 'Unique Identification Authority of India',
  requirements: [{ fact_id: 'registered-mobile', text: 'Your mobile number must already be registered with Aadhaar.', source_ids: ['uidai-update-overview'] }],
  required_documents: [{ document_id: 'proof-of-address', name: 'Valid proof of address', guidance: 'Upload a clear colour scan of an accepted document.', source_ids: ['uidai-update-overview'] }],
  fee: { amount: '50.00', currency: 'INR', statement: 'The official fee is ₹50, including GST.', qualifiers: [], source_ids: ['uidai-fee'] },
  steps: [{ step_id: 'open-portal', order: 1, title: 'Open the official portal', instruction: 'Continue on MyAadhaar.', source_ids: ['uidai-update-overview'] }],
  submission_channels: [{ channel_id: 'online', mode: 'online', name: 'MyAadhaar', guidance: 'Use the official portal.', source_ids: ['uidai-update-overview'] }],
  official_handoff_url: 'https://myaadhaar.uidai.gov.in/',
  tracking_guidance: { fact_id: 'tracking', text: 'Keep the SRN to check status.', source_ids: ['uidai-process'] },
  sources: [{ source_id: 'uidai-update-overview', publisher: 'Unique Identification Authority of India', title: 'Updating Data on Aadhaar', url: 'https://uidai.gov.in/en/updating-data-on-aadhaar', retrieved_at: '2026-08-28T00:00:00+05:30', official_updated_date: '2026-07-03', sha256: null, source_type: 'webpage' }],
  provenance: { fee: ['uidai-fee'] }, pack_digest: 'a'.repeat(64),
  limitations: [{ fact_id: 'guidance-only', text: 'Sahayi is guidance only.', source_ids: ['uidai-update-overview'] }],
}

const response = (body: unknown) => Promise.resolve({ ok: true, json: async () => body })

function mockApi(options: { procedures?: ProcedureSummary[]; procedure?: ProcedureDetail; failCatalogue?: boolean; failDetail?: boolean } = {}) {
  const fetchMock = vi.fn((input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/health')) return response({ status: 'ok' })
    if (url.endsWith('/public-config')) return response({ application_name: 'Sahayi', kiosk_mode: true })
    if (url.endsWith('/procedures')) return options.failCatalogue ? Promise.reject(new Error('offline')) : response({ procedures: options.procedures ?? [summary] })
    if (url.includes('/procedures/')) return options.failDetail ? Promise.reject(new Error('offline')) : response(options.procedure ?? detail)
    return Promise.reject(new Error(`Unexpected request: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function openCatalogue() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
  await screen.findByRole('heading', { name: 'Supported services' })
}

async function openProcedure() {
  await openCatalogue()
  fireEvent.click(await screen.findByRole('button', { name: /Update your Aadhaar address online/ }))
  await screen.findByRole('heading', { name: 'Update your Aadhaar address online' })
}

describe('Sahayi verified procedure flow', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('renders the welcome content and loading state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sahayi' })).toBeInTheDocument()
    expect(screen.getByText('Government services, explained around what you need.')).toBeInTheDocument()
    expect(screen.getByText('Checking service availability…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('enables Start and opens the populated service catalogue', async () => {
    mockApi()
    render(<App />)
    await openCatalogue()
    expect(screen.getByRole('button', { name: /Update your Aadhaar address online/ })).toBeInTheDocument()
    expect(screen.getByText(/Official UIDAI guidance/)).toBeInTheDocument()
  })

  it('selects the service and shows trust-card provenance', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    expect(screen.getByRole('heading', { name: 'Verified official guidance' })).toBeInTheDocument()
    expect(screen.getAllByText('Unique Identification Authority of India').length).toBeGreaterThan(0)
    expect(screen.getByText('1.0.0')).toBeInTheDocument()
    expect(screen.getByText('28 Aug 2026')).toBeInTheDocument()
    const source = screen.getByRole('link', { name: /Updating Data on Aadhaar/ })
    expect(source).toHaveAttribute('target', '_blank')
    expect(source).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('labels the official handoff and applies external-link safety', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    const handoff = screen.getByRole('link', { name: /Open the official MyAadhaar website/ })
    expect(handoff).toHaveAttribute('href', 'https://myaadhaar.uidai.gov.in/')
    expect(handoff).toHaveAttribute('target', '_blank')
    expect(handoff).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/It is not UIDAI or a government service/)).toBeInTheDocument()
  })

  it('shows a prominent stale warning', async () => {
    mockApi({ procedure: { ...detail, trust_state: 'stale' } })
    render(<App />)
    await openProcedure()
    expect(screen.getByRole('alert')).toHaveTextContent('This guidance needs review')
    expect(screen.getByText('Stale — review overdue')).toBeInTheDocument()
  })

  it('handles backend failure and an empty catalogue', async () => {
    mockApi({ failCatalogue: true })
    const { unmount } = render(<App />)
    await openCatalogue()
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load services')

    unmount()
    vi.restoreAllMocks()
    mockApi({ procedures: [] })
    render(<App />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByText('No procedures are available')).toBeInTheDocument()
  })

  it('provides Back and Start Over controls', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Supported services' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Over' }))
    expect(screen.getByRole('heading', { name: 'Sahayi' })).toBeInTheDocument()
  })

  it('does not introduce browser persistence', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    mockApi()
    render(<App />)
    await openProcedure()
    expect(storageWrite).not.toHaveBeenCalled()
  })

  it('shows an unavailable backend state on initial failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Service is temporarily unavailable')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })
})
