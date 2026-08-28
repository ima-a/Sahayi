import { useEffect, useRef, useState, type FormEvent } from 'react'
import { evaluateReadiness, getHealth, getProcedure, getProcedures, getPublicConfig, type HealthStatus, type ProcedureDetail, type ProcedureSummary, type ReadinessAnswer, type ReadinessResponse } from './api'
import { detectHighRiskPii, matchProcedures, MAX_QUERY_LENGTH, type MatchResult } from './matcher'
import './App.css'

type Availability = 'loading' | 'available' | 'unavailable'
type Screen = 'welcome' | 'intake' | 'catalogue' | 'detail' | 'readiness'

const formatDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function App() {
  const [availability, setAvailability] = useState<Availability>('loading')
  const [name, setName] = useState('Sahayi')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [procedures, setProcedures] = useState<ProcedureSummary[] | null>(null)
  const [detail, setDetail] = useState<ProcedureDetail | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null)
  const [readinessAnswers, setReadinessAnswers] = useState<Record<string, ReadinessAnswer>>({})
  const [readinessHistory, setReadinessHistory] = useState<Array<Record<string, ReadinessAnswer>>>([])
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState(false)
  const [query, setQuery] = useState('')
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [piiWarning, setPiiWarning] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([getHealth(), getPublicConfig()])
      .then(([health, config]: [HealthStatus, { application_name: string }]) => {
        if (active && health.status === 'ok') { setName(config.application_name); setAvailability('available') }
      })
      .catch(() => active && setAvailability('unavailable'))
    return () => { active = false }
  }, [])

  const start = () => {
    setScreen('intake')
    setProcedures(null)
    setCatalogueError(false)
    getProcedures().then(({ procedures: items }) => setProcedures(items)).catch(() => setCatalogueError(true))
  }

  const selectProcedure = (serviceId: string) => {
    setScreen('detail')
    setQuery('')
    setMatch(null)
    setPiiWarning(false)
    setDetail(null)
    setDetailError(false)
    getProcedure(serviceId).then(setDetail).catch(() => setDetailError(true))
  }

  const findService = () => {
    if (detectHighRiskPii(query)) { setPiiWarning(true); setMatch(null); return }
    setPiiWarning(false)
    setMatch(matchProcedures(query, procedures ?? []))
  }

  const useExample = (example: string) => {
    setQuery(example)
    setMatch(null)
    setPiiWarning(false)
  }

  const confirmProcedure = (serviceId: string) => {
    setQuery('')
    setMatch(null)
    setPiiWarning(false)
    selectProcedure(serviceId)
  }

  const startOver = () => {
    setScreen('welcome')
    setProcedures(null)
    setDetail(null)
    setCatalogueError(false)
    setDetailError(false)
    setReadiness(null)
    setReadinessAnswers({})
    setReadinessHistory([])
    setReadinessLoading(false)
    setReadinessError(false)
    setQuery('')
    setMatch(null)
    setPiiWarning(false)
  }

  const openReadiness = () => {
    setScreen('readiness')
    setReadiness(null)
    setReadinessAnswers({})
    setReadinessHistory([])
    setReadinessError(false)
  }

  const requestReadiness = async (answers: Record<string, ReadinessAnswer>) => {
    if (!detail) return null
    setReadinessLoading(true)
    setReadinessError(false)
    try {
      return await evaluateReadiness(detail.service_id, answers)
    } catch {
      setReadinessError(true)
      return null
    } finally {
      setReadinessLoading(false)
    }
  }

  const beginReadiness = async () => {
    const result = await requestReadiness({})
    if (result) setReadiness(result)
  }

  const answerReadiness = async (answer: ReadinessAnswer) => {
    if (!readiness?.next_question) return
    const nextAnswers = { ...readinessAnswers, [readiness.next_question.question_id]: answer }
    const result = await requestReadiness(nextAnswers)
    if (result) {
      setReadinessHistory([...readinessHistory, readinessAnswers])
      setReadinessAnswers(nextAnswers)
      setReadiness(result)
    }
  }

  const backReadiness = async () => {
    if (readiness === null) {
      setScreen('detail')
      setReadinessAnswers({})
      setReadinessHistory([])
      setReadinessError(false)
      return
    }
    if (readinessHistory.length === 0) {
      setReadiness(null)
      setReadinessAnswers({})
      setReadinessHistory([])
      setReadinessError(false)
      return
    }
    const previousAnswers = readinessHistory[readinessHistory.length - 1]
    const result = await requestReadiness(previousAnswers)
    if (result) {
      setReadinessHistory(readinessHistory.slice(0, -1))
      setReadinessAnswers(previousAnswers)
      setReadiness(result)
    }
  }

  const statusText = availability === 'loading' ? 'Checking service availability…' : availability === 'available' ? 'Service is ready' : 'Service is temporarily unavailable'

  if (screen === 'intake') return <Intake
    procedures={procedures}
    error={catalogueError}
    query={query}
    match={match}
    piiWarning={piiWarning}
    onQueryChange={(value) => { setQuery(value); setMatch(null); setPiiWarning(false) }}
    onFind={findService}
    onExample={useExample}
    onBrowse={() => setScreen('catalogue')}
    onConfirm={confirmProcedure}
    onChooseAnother={() => { setMatch(null); setQuery('') }}
    onStartOver={startOver}
  />

  if (screen === 'catalogue') return <main className="kiosk-shell"><section className="content-card" aria-labelledby="catalogue-title">
    <header className="page-header"><div><p className="eyebrow">Verified guidance</p><h1 id="catalogue-title">Supported services</h1><p>Choose a service to see steps verified from official sources.</p></div><button className="secondary compact" type="button" onClick={startOver}>Start Over</button></header>
    {catalogueError ? <div className="state-panel error" role="alert"><h2>We could not load services</h2><p>The guidance service is temporarily unavailable. Please try again later.</p></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">Loading supported services…</div>
        : procedures.length === 0 ? <div className="state-panel" role="status"><h2>No procedures are available</h2><p>No verified service guidance can be shown right now.</p></div>
          : <ul className="service-list">{procedures.map(procedure => <li key={procedure.service_id}><button className="service-card" type="button" onClick={() => selectProcedure(procedure.service_id)}>
            <span><strong>{procedure.title}</strong><small>{procedure.short_description}</small>{procedure.attention_required && <small className="attention-badge">Fee needs confirmation</small>}</span><span aria-hidden="true">→</span>
          </button></li>)}</ul>}
  </section></main>

  if (screen === 'detail') return <main className="kiosk-shell"><section className="content-card detail-page" aria-live="polite">
    <nav className="page-actions" aria-label="Procedure navigation"><button className="secondary compact" type="button" onClick={() => setScreen('catalogue')}>Back</button><button className="secondary compact" type="button" onClick={startOver}>Start Over</button></nav>
    {detailError ? <div className="state-panel error" role="alert"><h1>Procedure unavailable</h1><p>We could not load this verified procedure.</p></div>
      : detail === null ? <div className="state-panel" role="status">Loading procedure guidance…</div>
        : <ProcedureOverview procedure={detail} onStartReadiness={openReadiness} />}
  </section></main>

  if (screen === 'readiness' && detail) return <ReadinessFlow
    key={readiness?.complete ? readiness.outcome?.outcome_id : readiness?.next_question?.question_id ?? 'introduction'}
    response={readiness}
    loading={readinessLoading}
    error={readinessError}
    onBegin={beginReadiness}
    onAnswer={answerReadiness}
    onBack={backReadiness}
    onStartOver={startOver}
  />

  return <main className="kiosk-shell"><section className="welcome-card" aria-labelledby="sahayi-title">
    <p className="eyebrow">Hackathon prototype</p><div className="mark" aria-hidden="true">S</div>
    <h1 id="sahayi-title">{name}</h1><p className="tagline">Government services, explained around what you need.</p>
    <p className={`availability ${availability}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{statusText}</p>
    <button type="button" disabled={availability !== 'available'} onClick={start} aria-describedby="start-note">Start</button><p id="start-note" className="start-note">Sahayi offers guidance and does not submit applications.</p>
  </section></main>
}

function Intake({ procedures, error, query, match, piiWarning, onQueryChange, onFind, onExample, onBrowse, onConfirm, onChooseAnother, onStartOver }: {
  procedures: ProcedureSummary[] | null
  error: boolean
  query: string
  match: MatchResult | null
  piiWarning: boolean
  onQueryChange: (value: string) => void
  onFind: () => void
  onExample: (value: string) => void
  onBrowse: () => void
  onConfirm: (serviceId: string) => void
  onChooseAnother: () => void
  onStartOver: () => void
}) {
  const focusTarget = useRef<HTMLHeadingElement>(null)
  const resultTarget = useRef<HTMLDivElement>(null)
  useEffect(() => { focusTarget.current?.focus() }, [])
  useEffect(() => { if (match || piiWarning) resultTarget.current?.focus() }, [match, piiWarning])
  const examples = (procedures ?? []).flatMap(procedure => procedure.intent_phrases.slice(0, 1)).slice(0, 2)
  return <main className="kiosk-shell"><section className="content-card intake-page" aria-labelledby="intake-title">
    <nav className="page-actions" aria-label="Service intake navigation"><button className="secondary compact" type="button" onClick={onStartOver}>Start Over</button></nav>
    <p className="eyebrow">Private service finder</p><h1 id="intake-title" ref={focusTarget} tabIndex={-1}>What do you need help with?</h1>
    <p className="lead">Describe the service, not your personal situation. Matching happens on this device.</p>
    {error ? <div className="state-panel error" role="alert"><h2>We could not load services</h2><p>You can try again later.</p><button type="button" className="secondary compact" onClick={onBrowse}>Browse all services</button></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">Loading supported services…</div>
        : <>
          <label className="intake-label" htmlFor="service-query">Tell us what service you need</label>
          <p id="service-query-help" className="question-help">Do not enter an Aadhaar number, phone number, address, OTP, email, or other personal details.</p>
          <textarea id="service-query" value={query} maxLength={MAX_QUERY_LENGTH} rows={4} aria-describedby="service-query-help" onChange={event => onQueryChange(event.target.value)} />
          <p className="privacy-note">Your words stay in this browser and are not sent to Sahayi.</p>
          {examples.length > 0 && <div className="example-chips" aria-label="Examples">{examples.map(example => <button className="secondary chip" type="button" key={example} onClick={() => onExample(example)}>{example}</button>)}</div>}
          <div className="intake-actions"><button type="button" onClick={onFind} disabled={!query.trim()}>Find my service</button><button type="button" className="secondary" onClick={onBrowse}>Browse all services</button></div>
        </>}
    <div ref={resultTarget} tabIndex={-1}>
      {piiWarning && <p className="inline-error" role="alert">Please remove personal identifiers before continuing. This simple check cannot guarantee that all personal information is removed.</p>}
      {match?.kind === 'confident' && <section className="match-result" aria-labelledby="suggested-title"><h2 id="suggested-title">Is this the service you mean?</h2><h3>{match.candidate.procedure.title}</h3><p>{match.candidate.procedure.short_description}</p><div className="intake-actions"><button type="button" onClick={() => onConfirm(match.candidate.procedure.service_id)}>Yes, continue</button><button type="button" className="secondary" onClick={onChooseAnother}>Choose another service</button></div></section>}
      {match?.kind === 'ambiguous' && <section className="match-result" aria-labelledby="choose-title"><h2 id="choose-title">Choose the service you mean</h2><div className="candidate-list">{match.candidates.map(candidate => <button type="button" className="service-card" key={candidate.procedure.service_id} onClick={() => onConfirm(candidate.procedure.service_id)}><span><strong>{candidate.procedure.title}</strong><small>{candidate.procedure.short_description}</small></span><span aria-hidden="true">→</span></button>)}</div><button type="button" className="secondary compact" onClick={onChooseAnother}>Choose another service</button></section>}
      {match?.kind === 'none' && <section className="match-result" aria-labelledby="no-match-title"><h2 id="no-match-title">We could not find a matching service</h2><p>Sahayi currently supports a limited number of services. You can browse the complete catalogue.</p><button type="button" className="secondary" onClick={onBrowse}>Browse all services</button></section>}
    </div>
  </section></main>
}

function ProcedureOverview({ procedure, onStartReadiness }: { procedure: ProcedureDetail; onStartReadiness: () => void }) {
  const sourceById = new Map(procedure.sources.map(source => [source.source_id, source]))
  return <article aria-labelledby="procedure-title">
    <p className="eyebrow">{procedure.category.replaceAll('-', ' ')}</p><h1 id="procedure-title">{procedure.title}</h1><p className="lead">{procedure.short_description}</p>
    {procedure.trust_state === 'stale' && <div className="stale-warning" role="alert"><strong>This guidance needs review.</strong> The review date has passed. Confirm every detail on the official service website before continuing.</div>}
    <section className={`trust-card ${procedure.trust_state}`} aria-labelledby="trust-title"><div><p className="overline">Trust and provenance</p><h2 id="trust-title">Verified official guidance</h2></div>
      <dl><div><dt>Official publisher</dt><dd>{procedure.official_publisher}</dd></div><div><dt>Pack version</dt><dd>{procedure.pack_version}</dd></div><div><dt>Verified</dt><dd>{formatDate(procedure.last_verified_at)}</dd></div><div><dt>Freshness</dt><dd>{procedure.trust_state === 'current' ? 'Current' : 'Stale — review overdue'}</dd></div></dl>
      <div><h3>Official sources</h3><ul className="source-list">{procedure.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></div>
    </section>
    <p className="disclaimer"><strong>Sahayi is guidance only.</strong> It is not the official service or a government service. Sahayi cannot authenticate you, submit an application, or track it.</p>
    <section className="readiness-callout" aria-labelledby="readiness-callout-title"><div><h2 id="readiness-callout-title">Check what you need</h2><p>Answer simple choices to see which verified official path may fit your situation.</p></div><button type="button" onClick={onStartReadiness}>Check what you need</button></section>
    <div className="detail-grid"><section><h2>Before you start</h2><ul>{procedure.requirements.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul><h3>Document guidance</h3>{procedure.required_documents.map(document => <div key={document.document_id}><strong>{document.name}</strong><p>{document.guidance}</p></div>)}</section>
      <section className={`fee-card ${procedure.fee.verification_status}`} role={procedure.fee.verification_status === 'conflicting' ? 'alert' : undefined} aria-labelledby="fee-title">
        <h2 id="fee-title">{procedure.fee.verification_status === 'conflicting' ? 'Fee needs confirmation' : 'Fee information'}</h2>
        <p>{procedure.fee.display_message}</p>
        {procedure.fee.claims.length > 0 && <ul className="fee-claims">{procedure.fee.claims.map(claim => <li key={`${claim.currency}-${claim.amount}-${claim.source_ids.join('-')}`}>
          <strong>₹{Number(claim.amount).toLocaleString('en-IN')}</strong><span>{claim.qualifier}</span>
          <span className="claim-sources">Source: {claim.source_ids.map((sourceId, index) => { const source = sourceById.get(sourceId); return source ? <span key={sourceId}>{index > 0 && ', '}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></span> : null })}</span>
        </li>)}</ul>}
        {procedure.fee.resolution_guidance && <p className="resolution-guidance"><strong>Before paying:</strong> {procedure.fee.resolution_guidance}</p>}
      </section></div>
    <section><h2>Steps</h2><ol className="steps">{procedure.steps.map(step => <li key={step.step_id}><div><span>{step.order}</span></div><section><h3>{step.title}</h3><p>{step.instruction}</p></section></li>)}</ol></section>
    <section><h2>Where to apply</h2>{procedure.submission_channels.map(channel => <div key={channel.channel_id}><h3>{channel.name}</h3><p>{channel.guidance}</p></div>)}</section>
    {procedure.tracking_guidance && <section><h2>Tracking</h2><p>{procedure.tracking_guidance.text}</p></section>}
    {procedure.additional_review_items.length > 0 && <section><h2>Additional local-body review</h2><p>These official conditions need respectful review by the relevant local body. Sahayi does not ask about or infer them.</p><ul>{procedure.additional_review_items.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul></section>}
    <section><h2>Important limitations</h2><ul>{procedure.limitations.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul></section>
    <a className="official-handoff" href={procedure.official_handoff_url} target="_blank" rel="noopener noreferrer">Open the official service <span aria-hidden="true">↗</span></a>
  </article>
}

function ReadinessFlow({ response, loading, error, onBegin, onAnswer, onBack, onStartOver }: {
  response: ReadinessResponse | null
  loading: boolean
  error: boolean
  onBegin: () => void
  onAnswer: (answer: ReadinessAnswer) => void
  onBack: () => void
  onStartOver: () => void
}) {
  const [selected, setSelected] = useState<ReadinessAnswer | undefined>()
  const [validationError, setValidationError] = useState(false)
  const focusTarget = useRef<HTMLHeadingElement>(null)
  const stateKey = response?.complete ? response.outcome?.outcome_id : response?.next_question?.question_id

  useEffect(() => {
    focusTarget.current?.focus()
  }, [stateKey])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (selected === undefined || selected === '') {
      setValidationError(true)
      return
    }
    setValidationError(false)
    onAnswer(selected)
  }

  return <main className="kiosk-shell"><section className="content-card readiness-page">
    <nav className="page-actions" aria-label="Readiness check navigation"><button className="secondary compact" type="button" onClick={onBack} disabled={loading}>Back</button><button className="secondary compact" type="button" onClick={onStartOver}>Start Over</button></nav>
    {response === null ? <section aria-labelledby="readiness-title">
      <p className="eyebrow">Readiness check</p><h1 id="readiness-title" ref={focusTarget} tabIndex={-1}>Check what you need</h1>
      <p className="lead">This check asks only simple choices. Do not enter an Aadhaar number, mobile number, address, OTP, or document.</p>
      <ul className="privacy-points"><li>Your answers stay in this page's memory only.</li><li>Sahayi does not store or submit your answers.</li><li>The result is guidance, not an eligibility decision.</li></ul>
      {error && <p className="inline-error" role="alert">The readiness check is temporarily unavailable. Your answers were not sent again.</p>}
      <button type="button" onClick={onBegin} disabled={loading}>{loading ? 'Starting…' : 'Begin readiness check'}</button>
    </section> : response.complete && response.outcome ? <section className="readiness-result" aria-labelledby="result-title">
      <p className="eyebrow">Readiness result</p><h1 id="result-title" ref={focusTarget} tabIndex={-1}>{response.outcome.title}</h1>
      <p className="result-status"><strong>Status:</strong> {response.outcome.status.replaceAll('_', ' ')}</p>
      <section aria-labelledby="reason-title"><h2 id="reason-title">Why this result</h2><p>{response.outcome.explanation}</p></section>
      <section aria-labelledby="next-steps-title"><h2 id="next-steps-title">Recommended next steps</h2><ol>{response.recommended_next_steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      <section aria-labelledby="result-sources-title"><h2 id="result-sources-title">Official sources</h2><ul className="source-list">{response.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></section>
      <p className="result-disclaimer"><strong>Important:</strong> {response.disclaimer}</p>
      {response.official_handoff_url && <a className="official-handoff" href={response.official_handoff_url} target="_blank" rel="noopener noreferrer">Open the official next step <span aria-hidden="true">↗</span></a>}
    </section> : response.next_question ? <section aria-labelledby="question-title">
      <p className="progress" role="status" aria-live="polite">Question {response.progress.answered + 1} of {response.progress.total}</p>
      <h1 id="question-title" ref={focusTarget} tabIndex={-1}>{response.next_question.prompt}</h1>
      {response.next_question.help_text && <p id="question-help" className="question-help">{response.next_question.help_text}</p>}
      {response.next_question.sensitivity === 'sensitive' && <p className="question-help"><strong>Privacy:</strong> Choose a category only. You may select “Prefer not to answer”; Sahayi does not store this answer.</p>}
      <form onSubmit={submit}>
        <fieldset aria-describedby={`${response.next_question.help_text ? 'question-help ' : ''}${validationError ? 'answer-error' : ''}`.trim()}>
          <legend className="visually-hidden">Choose one answer</legend>
          <div className="answer-options">
            {response.next_question.answer_type === 'boolean' && <>
              <label><input type="radio" name="readiness-answer" value="yes" checked={selected === true} onChange={() => setSelected(true)} /> <span>Yes</span></label>
              <label><input type="radio" name="readiness-answer" value="no" checked={selected === false} onChange={() => setSelected(false)} /> <span>No</span></label>
            </>}
            {response.next_question.answer_type === 'single_choice' && response.next_question.options?.map(option => <label key={option.option_id}><input type="radio" name="readiness-answer" value={option.option_id} checked={selected === option.option_id} onChange={() => setSelected(option.option_id)} /> <span>{option.label}</span></label>)}
            {response.next_question.answer_type === 'integer' && <label className="number-answer"><span>Number</span><input type="number" step="1" min={response.next_question.minimum ?? undefined} max={response.next_question.maximum ?? undefined} value={typeof selected === 'number' ? selected : ''} onChange={event => setSelected(event.target.value === '' ? undefined : Number(event.target.value))} /></label>}
          </div>
        </fieldset>
        {validationError && <p id="answer-error" className="inline-error" role="alert">Choose an answer to continue.</p>}
        {error && <p className="inline-error" role="alert">We could not continue the readiness check. Your answer remains only on this page.</p>}
        <button type="submit" disabled={loading}>{loading ? 'Checking…' : 'Continue'}</button>
      </form>
    </section> : null}
  </section></main>
}

export default App
