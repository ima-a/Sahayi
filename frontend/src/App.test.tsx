import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('Sahayi welcome screen', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('renders the welcome content and loading state', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Sahayi' })).toBeInTheDocument()
    expect(screen.getByText('Government services, explained around what you need.')).toBeInTheDocument()
    expect(screen.getByText('Checking service availability…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })
  it('shows a healthy backend state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', application_name: 'Sahayi', kiosk_mode: true }) }))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Service is ready')).toBeInTheDocument())
  })
  it('shows an unavailable backend state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Service is temporarily unavailable')).toBeInTheDocument())
  })
})
