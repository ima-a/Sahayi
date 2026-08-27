import { useEffect, useState } from 'react'
import { getHealth, getProcedure, getProcedures, getPublicConfig, type HealthStatus, type ProcedureDetail, type ProcedureSummary } from './api'
import './App.css'

type Availability = 'loading' | 'available' | 'unavailable'
type Screen = 'welcome' | 'catalogue' | 'detail'

const formatDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function App() {
  const [availability, setAvailability] = useState<Availability>('loading')
  const [name, setName] = useState('Sahayi')
  const [screen, setScreen] = useState<Screen>('welcome')
  const [procedures, setProcedures] = useState<ProcedureSummary[] | null>(null)
  const [detail, setDetail] = useState<ProcedureDetail | null>(null)
  const [catalogueError, setCatalogueError] = useState(false)
  const [detailError, setDetailError] = useState(false)

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
    setScreen('catalogue')
    setProcedures(null)
    setCatalogueError(false)
    getProcedures().then(({ procedures: items }) => setProcedures(items)).catch(() => setCatalogueError(true))
  }

  const selectProcedure = (serviceId: string) => {
    setScreen('detail')
    setDetail(null)
    setDetailError(false)
    getProcedure(serviceId).then(setDetail).catch(() => setDetailError(true))
  }

  const startOver = () => {
    setScreen('welcome')
    setProcedures(null)
    setDetail(null)
    setCatalogueError(false)
    setDetailError(false)
  }

  const statusText = availability === 'loading' ? 'Checking service availability…' : availability === 'available' ? 'Service is ready' : 'Service is temporarily unavailable'

  if (screen === 'catalogue') return <main className="kiosk-shell"><section className="content-card" aria-labelledby="catalogue-title">
    <header className="page-header"><div><p className="eyebrow">Verified guidance</p><h1 id="catalogue-title">Supported services</h1><p>Choose a service to see steps verified from official sources.</p></div><button className="secondary compact" type="button" onClick={startOver}>Start Over</button></header>
    {catalogueError ? <div className="state-panel error" role="alert"><h2>We could not load services</h2><p>The guidance service is temporarily unavailable. Please try again later.</p></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">Loading supported services…</div>
        : procedures.length === 0 ? <div className="state-panel" role="status"><h2>No procedures are available</h2><p>No verified service guidance can be shown right now.</p></div>
          : <ul className="service-list">{procedures.map(procedure => <li key={procedure.service_id}><button className="service-card" type="button" onClick={() => selectProcedure(procedure.service_id)}>
            <span><strong>{procedure.title}</strong><small>{procedure.short_description}</small></span><span aria-hidden="true">→</span>
          </button></li>)}</ul>}
  </section></main>

  if (screen === 'detail') return <main className="kiosk-shell"><section className="content-card detail-page" aria-live="polite">
    <nav className="page-actions" aria-label="Procedure navigation"><button className="secondary compact" type="button" onClick={() => setScreen('catalogue')}>Back</button><button className="secondary compact" type="button" onClick={startOver}>Start Over</button></nav>
    {detailError ? <div className="state-panel error" role="alert"><h1>Procedure unavailable</h1><p>We could not load this verified procedure.</p></div>
      : detail === null ? <div className="state-panel" role="status">Loading procedure guidance…</div>
        : <ProcedureOverview procedure={detail} />}
  </section></main>

  return <main className="kiosk-shell"><section className="welcome-card" aria-labelledby="sahayi-title">
    <p className="eyebrow">Hackathon prototype</p><div className="mark" aria-hidden="true">S</div>
    <h1 id="sahayi-title">{name}</h1><p className="tagline">Government services, explained around what you need.</p>
    <p className={`availability ${availability}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{statusText}</p>
    <button type="button" disabled={availability !== 'available'} onClick={start} aria-describedby="start-note">Start</button><p id="start-note" className="start-note">Sahayi offers guidance and does not submit applications.</p>
  </section></main>
}

function ProcedureOverview({ procedure }: { procedure: ProcedureDetail }) {
  return <article aria-labelledby="procedure-title">
    <p className="eyebrow">{procedure.category.replaceAll('-', ' ')}</p><h1 id="procedure-title">{procedure.title}</h1><p className="lead">{procedure.short_description}</p>
    {procedure.trust_state === 'stale' && <div className="stale-warning" role="alert"><strong>This guidance needs review.</strong> The review date has passed. Confirm every detail on the official UIDAI website before continuing.</div>}
    <section className={`trust-card ${procedure.trust_state}`} aria-labelledby="trust-title"><div><p className="overline">Trust and provenance</p><h2 id="trust-title">Verified official guidance</h2></div>
      <dl><div><dt>Official publisher</dt><dd>{procedure.official_publisher}</dd></div><div><dt>Pack version</dt><dd>{procedure.pack_version}</dd></div><div><dt>Verified</dt><dd>{formatDate(procedure.last_verified_at)}</dd></div><div><dt>Freshness</dt><dd>{procedure.trust_state === 'current' ? 'Current' : 'Stale — review overdue'}</dd></div></dl>
      <div><h3>Official sources</h3><ul className="source-list">{procedure.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></div>
    </section>
    <p className="disclaimer"><strong>Sahayi is guidance only.</strong> It is not UIDAI or a government service. Sahayi cannot authenticate you, submit this update, or track it.</p>
    <div className="detail-grid"><section><h2>Before you start</h2><ul>{procedure.requirements.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul><h3>Document guidance</h3>{procedure.required_documents.map(document => <div key={document.document_id}><strong>{document.name}</strong><p>{document.guidance}</p></div>)}</section>
      <section className="fee-card"><h2>Current fee</h2><p className="fee-amount">{procedure.fee.amount === null ? 'Unknown' : `₹${Number(procedure.fee.amount).toLocaleString('en-IN')}`}</p><p>{procedure.fee.statement}</p>{procedure.fee.qualifiers.map(qualifier => <small key={qualifier}>{qualifier}</small>)}</section></div>
    <section><h2>Steps</h2><ol className="steps">{procedure.steps.map(step => <li key={step.step_id}><div><span>{step.order}</span></div><section><h3>{step.title}</h3><p>{step.instruction}</p></section></li>)}</ol></section>
    {procedure.tracking_guidance && <section><h2>Tracking</h2><p>{procedure.tracking_guidance.text}</p></section>}
    <section><h2>Important limitations</h2><ul>{procedure.limitations.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul></section>
    <a className="official-handoff" href={procedure.official_handoff_url} target="_blank" rel="noopener noreferrer">Open the official MyAadhaar website <span aria-hidden="true">↗</span></a>
  </article>
}

export default App
