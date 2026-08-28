import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ProcedureDetail, ProcedureSummary, ReadinessResponse } from './api'

const summary: ProcedureSummary = {
  service_id: 'uidai-aadhaar-address-update',
  title: 'Update your Aadhaar address online',
  short_description: 'Official UIDAI guidance for requesting an address update through the MyAadhaar portal.',
  category: 'identity-documents', interaction_modes: ['online'], official_publisher: 'Unique Identification Authority of India',
  pack_version: '1.2.0', last_verified_at: '2026-08-28T10:10:25+05:30', review_due_at: '2026-09-11T10:10:25+05:30', trust_state: 'current', attention_required: true,
}

const detail: ProcedureDetail = {
  ...summary,
  jurisdiction: { level: 'national', name: 'India' }, department: 'Unique Identification Authority of India',
  requirements: [{ fact_id: 'registered-mobile', text: 'Your mobile number must already be registered with Aadhaar.', source_ids: ['uidai-update-overview'] }],
  required_documents: [{ document_id: 'proof-of-address', name: 'Valid proof of address', guidance: 'Upload a clear colour scan of an accepted document.', source_ids: ['uidai-update-overview'] }],
  fee: {
    verification_status: 'conflicting', amount: null, currency: null,
    display_message: "Fee needs confirmation because UIDAI's official pages currently show different amounts for this service.",
    claims: [
      { amount: '50.00', currency: 'INR', qualifier: 'The online address-update FAQ states this amount, including GST.', source_ids: ['uidai-enrolment-update-faq'] },
      { amount: '75.00', currency: 'INR', qualifier: 'The My Aadhaar service entry displays this amount for address update.', source_ids: ['uidai-my-aadhaar-services'] },
    ],
    resolution_guidance: "UIDAI's official pages currently show different amounts for this service. Confirm the fee on the official portal before payment.",
    source_ids: ['uidai-enrolment-update-faq', 'uidai-my-aadhaar-services'],
  },
  steps: [{ step_id: 'open-portal', order: 1, title: 'Open the official portal', instruction: 'Continue on MyAadhaar.', source_ids: ['uidai-update-overview'] }],
  submission_channels: [{ channel_id: 'online', mode: 'online', name: 'MyAadhaar', guidance: 'Use the official portal.', source_ids: ['uidai-update-overview'] }],
  official_handoff_url: 'https://myaadhaar.uidai.gov.in/',
  tracking_guidance: { fact_id: 'tracking', text: 'Keep the SRN to check status.', source_ids: ['uidai-process'] },
  sources: [
    { source_id: 'uidai-update-overview', publisher: 'Unique Identification Authority of India', title: 'Updating Data on Aadhaar', url: 'https://uidai.gov.in/en/updating-data-on-aadhaar', retrieved_at: '2026-08-28T10:10:25+05:30', official_updated_date: '2026-07-03', sha256: null, source_type: 'webpage' },
    { source_id: 'uidai-enrolment-update-faq', publisher: 'Unique Identification Authority of India', title: 'Enrolment & Update: myAadhaar - Online Update Service FAQ', url: 'https://uidai.gov.in/en/enrolment-and-update', retrieved_at: '2026-08-28T10:10:25+05:30', official_updated_date: '2026-07-02', sha256: null, source_type: 'webpage' },
    { source_id: 'uidai-my-aadhaar-services', publisher: 'Unique Identification Authority of India', title: 'My Aadhaar', url: 'https://uidai.gov.in/en/my-aadhaar', retrieved_at: '2026-08-28T10:10:25+05:30', official_updated_date: '2026-06-26', sha256: null, source_type: 'webpage' },
  ],
  provenance: { fee: ['uidai-enrolment-update-faq', 'uidai-my-aadhaar-services'] }, pack_digest: 'a'.repeat(64),
  limitations: [{ fact_id: 'guidance-only', text: 'Sahayi is guidance only.', source_ids: ['uidai-update-overview'] }],
}

const response = (body: unknown) => Promise.resolve({ ok: true, json: async () => body })

const readinessSource = detail.sources[0]
const readinessStep = (question: NonNullable<ReadinessResponse['next_question']>, answered: number, total: number): ReadinessResponse => ({
  pack_version: '1.2.0', pack_digest: 'b'.repeat(64), evaluation_status: 'incomplete', complete: false,
  progress: { answered, total }, next_question: question, outcome: null,
  reason_trace: [{ trace_type: 'question', trace_id: question.question_id, source_ids: [readinessSource.source_id] }],
  sources: [readinessSource], recommended_next_steps: [], official_handoff_url: null,
  disclaimer: 'This readiness check stores no answers and does not make an eligibility decision.',
})
const mobileQuestion: NonNullable<ReadinessResponse['next_question']> = { question_id: 'mobile-auth-access', prompt: 'Can you receive the mobile authentication required by UIDAI?', help_text: 'Do not enter a mobile number or OTP here.', answer_type: 'boolean', options: null, minimum: null, maximum: null, required: true }
const routeQuestion: NonNullable<ReadinessResponse['next_question']> = { question_id: 'address-update-route', prompt: 'Which official address-update route do you intend to use?', help_text: 'Choose without entering personal details.', answer_type: 'single_choice', options: [{ option_id: 'own-document', label: 'My own accepted proof of address' }, { option_id: 'head-of-family', label: 'A supported Head-of-Family route' }, { option_id: 'unsure', label: 'I am unsure' }], minimum: null, maximum: null, required: true }
const poaQuestion: NonNullable<ReadinessResponse['next_question']> = { question_id: 'accepted-poa-ready', prompt: 'Do you have an accepted proof-of-address document?', help_text: 'Do not upload or describe the document here.', answer_type: 'boolean', options: null, minimum: null, maximum: null, required: true }
const completeReadiness: ReadinessResponse = {
  pack_version: '1.2.0', pack_digest: 'b'.repeat(64), evaluation_status: 'ready', complete: true, progress: { answered: 3, total: 3 }, next_question: null,
  outcome: { outcome_id: 'own-document-ready', status: 'ready', title: 'You appear ready for the own-document route', explanation: 'Your choices indicate access to mobile authentication and an accepted proof-of-address route.' },
  reason_trace: [{ trace_type: 'rule', trace_id: 'own-document-ready', source_ids: [readinessSource.source_id] }], sources: [readinessSource],
  recommended_next_steps: ['Review UIDAI accepted-document guidance.', 'Continue on the official service.'], official_handoff_url: 'https://myaadhaar.uidai.gov.in/',
  disclaimer: 'This readiness result is personalised guidance, not an eligibility decision or official approval.',
}

function mockApi(options: { procedures?: ProcedureSummary[]; procedure?: ProcedureDetail; failCatalogue?: boolean; failDetail?: boolean; failReadiness?: boolean } = {}) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/health')) return response({ status: 'ok' })
    if (url.endsWith('/public-config')) return response({ application_name: 'Sahayi', kiosk_mode: true })
    if (url.endsWith('/procedures')) return options.failCatalogue ? Promise.reject(new Error('offline')) : response({ procedures: options.procedures ?? [summary] })
    if (url.endsWith('/readiness/evaluate')) {
      if (options.failReadiness) return Promise.reject(new Error('offline'))
      const answers = JSON.parse(String(init?.body)).answers as Record<string, unknown>
      if (Object.keys(answers).length === 0) return response(readinessStep(mobileQuestion, 0, 1))
      if (answers['mobile-auth-access'] === true && !answers['address-update-route']) return response(readinessStep(routeQuestion, 1, 2))
      if (answers['address-update-route'] === 'own-document' && !('accepted-poa-ready' in answers)) return response(readinessStep(poaQuestion, 2, 3))
      if (answers['accepted-poa-ready'] === true) return response(completeReadiness)
      return response({ ...completeReadiness, evaluation_status: 'alternative_path', outcome: { ...completeReadiness.outcome, outcome_id: 'use-alternative-channel', status: 'alternative_path', title: 'Use an alternative official channel' } })
    }
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
    expect(screen.getByText('Fee needs confirmation')).toBeInTheDocument()
  })

  it('selects the service and shows trust-card provenance', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    expect(screen.getByRole('heading', { name: 'Verified official guidance' })).toBeInTheDocument()
    expect(screen.getAllByText('Unique Identification Authority of India').length).toBeGreaterThan(0)
    expect(screen.getByText('1.2.0')).toBeInTheDocument()
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
    expect(screen.getAllByRole('alert').some(alert => alert.textContent?.includes('This guidance needs review'))).toBe(true)
    expect(screen.getByText('Stale — review overdue')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fee needs confirmation' })).toBeInTheDocument()
  })

  it('shows an accessible conflict warning with both source-attributed claims', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    const warning = screen.getByRole('alert')
    expect(warning).toHaveAccessibleName('Fee needs confirmation')
    expect(warning).toHaveTextContent("UIDAI's official pages currently show different amounts")
    expect(warning).toHaveTextContent('₹50')
    expect(warning).toHaveTextContent('₹75')
    expect(within(warning).getByRole('link', { name: /Online Update Service FAQ/ })).toHaveAttribute('href', 'https://uidai.gov.in/en/enrolment-and-update')
    expect(within(warning).getByRole('link', { name: 'My Aadhaar' })).toHaveAttribute('href', 'https://uidai.gov.in/en/my-aadhaar')
    expect(warning).toHaveTextContent('Confirm the fee on the official portal before payment')
    expect(warning).not.toHaveTextContent(/(?:official|current|recommended) fee is ₹(?:50|75)/i)
    expect(screen.queryByRole('heading', { name: 'Current fee' })).not.toBeInTheDocument()
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

  it('introduces the private readiness check from the procedure page', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    expect(screen.getByRole('heading', { name: 'Check what you need' })).toBeInTheDocument()
    expect(screen.getByText(/does not store or submit your answers/i)).toBeInTheDocument()
    expect(screen.getByText(/not an eligibility decision/i)).toBeInTheDocument()
    expect(screen.queryByText(mobileQuestion.prompt)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('heading', { name: 'Update your Aadhaar address online' })).toBeInTheDocument()
  })

  it('asks one conditional question per screen with progress and validation', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin readiness check' }))
    expect(await screen.findByRole('heading', { name: mobileQuestion.prompt })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Question 1 of 1')
    expect(screen.queryByText(routeQuestion.prompt)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an answer')
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: routeQuestion.prompt })).toHaveFocus()
    expect(screen.queryByText(mobileQuestion.prompt)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Question 2 of 2')
  })

  it('supports Back and Start Over while clearing answers', async () => {
    const fetchMock = mockApi()
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin readiness check' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByRole('heading', { name: routeQuestion.prompt })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: mobileQuestion.prompt })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Over' }))
    expect(screen.getByRole('heading', { name: 'Sahayi' })).toBeInTheDocument()
    const postedBodies = fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/readiness/evaluate')).map(call => JSON.parse(String(call[1]?.body)))
    expect(postedBodies.at(-1)).toEqual({ answers: {} })
  })

  it('shows completed cited reasoning, next steps, and the non-approval disclaimer', async () => {
    mockApi()
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin readiness check' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'My own accepted proof of address' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Yes' })); fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: completeReadiness.outcome?.title })).toHaveFocus()
    expect(screen.getByText(completeReadiness.outcome?.explanation ?? '')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Updating Data on Aadhaar/ })).toHaveAttribute('href', readinessSource.url)
    expect(screen.getByText(/personalised guidance, not an eligibility decision or official approval/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the official next step/ })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('handles readiness backend failure without exposing an answer', async () => {
    mockApi({ failReadiness: true })
    render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin readiness check' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(screen.getByRole('heading', { name: 'Check what you need' })).toBeInTheDocument()
  })

  it('starts with empty readiness state after a fresh mount', async () => {
    mockApi()
    const first = render(<App />)
    await openProcedure()
    fireEvent.click(screen.getByRole('button', { name: 'Check what you need' }))
    fireEvent.click(screen.getByRole('button', { name: 'Begin readiness check' }))
    expect(await screen.findByRole('heading', { name: mobileQuestion.prompt })).toBeInTheDocument()
    first.unmount()
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sahayi' })).toBeInTheDocument())
    expect(screen.queryByText(mobileQuestion.prompt)).not.toBeInTheDocument()
  })

  it('shows an unavailable backend state on initial failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Service is temporarily unavailable')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })
})
