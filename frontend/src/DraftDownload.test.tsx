import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DraftDownload } from './DraftDownload'
import type { SyntheticFormAssistance } from './api'
const generate = vi.fn()
vi.mock('./preparedDraft', () => ({ generateWorksheet: (...args: unknown[]) => generate(...args) }))
const sheet = { fields: [] } as unknown as SyntheticFormAssistance
beforeEach(() => {
  generate.mockReset().mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:synthetic-draft') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
})
it('automatically generates locally, requires review, invalidates edits and revokes on navigation', async () => {
  const first = {}
  const view = render(<DraftDownload sheet={sheet} values={first} checklist={null} locale="en" />)
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('link')).toHaveAttribute('download', 'sahayi-preparation.pdf')
  view.rerender(<DraftDownload sheet={sheet} values={{ name: { value: 'SYNTHETIC', source: 'citizen_confirmed_local_answer', valid: true, confirmed: true } }} checklist={null} locale="en" />)
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2))
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  view.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
})
it('erases a late artifact after session cleanup without creating a URL', async () => {
  let finish!: (value: Uint8Array) => void
  generate.mockReturnValue(new Promise(resolve => { finish = resolve }))
  const view = render(<DraftDownload sheet={sheet} values={{}} checklist={null} locale="en" />)
  await waitFor(() => expect(generate).toHaveBeenCalled())
  view.unmount()
  const bytes = new Uint8Array([1, 2, 3])
  await act(async () => finish(bytes))
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect([...bytes]).toEqual([0, 0, 0])
})
