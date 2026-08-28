import { useEffect, useRef, useState, type FormEvent } from 'react'
import { evaluateReadiness, getHealth, getProcedure, getProcedures, getPublicConfig, type HealthStatus, type ProcedureDetail, type ProcedureSummary, type ReadinessAnswer, type ReadinessResponse } from './api'
import { formatMessage, LANGUAGE_NAMES, LOCALES, UI_MESSAGES, type Locale, type Messages } from './i18n'
import { detectHighRiskPii, matchProcedures, MAX_QUERY_LENGTH, type MatchResult } from './matcher'
import './App.css'

type Availability = 'loading' | 'available' | 'unavailable'
type Screen = 'welcome' | 'intake' | 'catalogue' | 'detail' | 'readiness'

const dateLocales: Record<Locale, string> = { en: 'en-IN', hi: 'hi-IN', ml: 'ml-IN' }
const formatDate = (value: string, locale: Locale) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString(dateLocales[locale], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

function LanguageControls({ locale, onChange, messages }: { locale: Locale; onChange: (locale: Locale) => void; messages: Messages }) {
  return <div className="language-controls">
    <label htmlFor="language-selector">{messages.language}</label>
    <select id="language-selector" value={locale} onChange={event => onChange(event.target.value as Locale)}>
      {LOCALES.map(item => <option key={item} value={item}>{LANGUAGE_NAMES[item]}</option>)}
    </select>
    <p className="translation-note" role="note">{messages.canonicalNotice}</p>
  </div>
}

function App() {
  const [locale, setLocale] = useState<Locale>('en')
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
  const messages = UI_MESSAGES[locale]

  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => {
    let active = true
    Promise.all([getHealth(), getPublicConfig()])
      .then(([health, config]: [HealthStatus, { application_name: string }]) => {
        if (active && health.status === 'ok') { setName(config.application_name); setAvailability('available') }
      })
      .catch(() => active && setAvailability('unavailable'))
    return () => { active = false }
  }, [])

  const loadProcedures = (nextLocale: Locale) => {
    setCatalogueError(false)
    getProcedures(nextLocale).then(({ procedures: items }) => setProcedures(items)).catch(() => setCatalogueError(true))
  }

  const changeLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    setMatch(null)
    setPiiWarning(false)
    if (procedures !== null || screen === 'intake' || screen === 'catalogue') {
      setProcedures(null)
      loadProcedures(nextLocale)
    }
    if (detail) {
      getProcedure(detail.service_id, nextLocale).then(setDetail).catch(() => setDetailError(true))
      if (screen === 'readiness' && readiness !== null) {
        setReadinessLoading(true)
        evaluateReadiness(detail.service_id, readinessAnswers, nextLocale)
          .then(setReadiness)
          .catch(() => setReadinessError(true))
          .finally(() => setReadinessLoading(false))
      }
    }
  }

  const start = () => {
    setScreen('intake')
    setProcedures(null)
    loadProcedures(locale)
  }

  const selectProcedure = (serviceId: string) => {
    setScreen('detail')
    setQuery('')
    setMatch(null)
    setPiiWarning(false)
    setDetail(null)
    setDetailError(false)
    getProcedure(serviceId, locale).then(setDetail).catch(() => setDetailError(true))
  }

  const findService = () => {
    if (detectHighRiskPii(query)) { setPiiWarning(true); setMatch(null); return }
    setPiiWarning(false)
    setMatch(matchProcedures(query, procedures ?? []))
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
    try { return await evaluateReadiness(detail.service_id, answers, locale) }
    catch { setReadinessError(true); return null }
    finally { setReadinessLoading(false) }
  }

  const beginReadiness = async () => { const result = await requestReadiness({}); if (result) setReadiness(result) }
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
    if (readiness === null) { setScreen('detail'); setReadinessAnswers({}); setReadinessHistory([]); setReadinessError(false); return }
    if (readinessHistory.length === 0) { setReadiness(null); setReadinessAnswers({}); setReadinessHistory([]); setReadinessError(false); return }
    const previousAnswers = readinessHistory.at(-1) ?? {}
    const result = await requestReadiness(previousAnswers)
    if (result) { setReadinessHistory(readinessHistory.slice(0, -1)); setReadinessAnswers(previousAnswers); setReadiness(result) }
  }

  const language = <LanguageControls locale={locale} onChange={changeLocale} messages={messages} />
  const statusText = availability === 'loading' ? messages.availabilityLoading : availability === 'available' ? messages.availabilityReady : messages.availabilityUnavailable

  if (screen === 'intake') return <Intake locale={locale} messages={messages} language={language} procedures={procedures} error={catalogueError} query={query} match={match} piiWarning={piiWarning}
    onQueryChange={value => { setQuery(value); setMatch(null); setPiiWarning(false) }} onFind={findService}
    onExample={value => { setQuery(value); setMatch(null); setPiiWarning(false) }} onBrowse={() => setScreen('catalogue')}
    onConfirm={serviceId => { setQuery(''); setMatch(null); setPiiWarning(false); selectProcedure(serviceId) }}
    onChooseAnother={() => { setMatch(null); setQuery('') }} onStartOver={startOver} />

  if (screen === 'catalogue') return <main className="kiosk-shell"><section className="content-card" aria-labelledby="catalogue-title">{language}
    <header className="page-header"><div><p className="eyebrow">{messages.verifiedGuidance}</p><h1 id="catalogue-title">{messages.supportedServices}</h1><p>{messages.chooseService}</p></div><button className="secondary compact" type="button" onClick={startOver}>{messages.startOver}</button></header>
    {catalogueError ? <div className="state-panel error" role="alert"><h2>{messages.loadServicesTitle}</h2><p>{messages.loadServicesBody}</p></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">{messages.loadingServices}</div>
        : procedures.length === 0 ? <div className="state-panel" role="status"><h2>{messages.noProceduresTitle}</h2><p>{messages.noProceduresBody}</p></div>
          : <ul className="service-list">{procedures.map(procedure => <li key={procedure.service_id}><button className="service-card" type="button" onClick={() => selectProcedure(procedure.service_id)}>
            <span><strong>{procedure.title}</strong><small>{procedure.short_description}</small>{procedure.attention_required && <small className="attention-badge">{messages.feeNeedsConfirmation}</small>}</span><span aria-hidden="true">→</span>
          </button></li>)}</ul>}
  </section></main>

  if (screen === 'detail') return <main className="kiosk-shell"><section className="content-card detail-page" aria-live="polite">{language}
    <nav className="page-actions" aria-label={messages.procedureNavigation}><button className="secondary compact" type="button" onClick={() => setScreen('catalogue')}>{messages.back}</button><button className="secondary compact" type="button" onClick={startOver}>{messages.startOver}</button></nav>
    {detailError ? <div className="state-panel error" role="alert"><h1>{messages.procedureUnavailable}</h1><p>{messages.procedureUnavailableBody}</p></div>
      : detail === null ? <div className="state-panel" role="status">{messages.loadingProcedure}</div>
        : <ProcedureOverview procedure={detail} locale={locale} messages={messages} onStartReadiness={openReadiness} />}
  </section></main>

  if (screen === 'readiness' && detail) return <ReadinessFlow key={readiness?.complete ? readiness.outcome?.outcome_id : readiness?.next_question?.question_id ?? `introduction-${locale}`}
    response={readiness} loading={readinessLoading} error={readinessError} locale={locale} messages={messages} language={language}
    onBegin={beginReadiness} onAnswer={answerReadiness} onBack={backReadiness} onStartOver={startOver} />

  return <main className="kiosk-shell"><section className="welcome-card" aria-labelledby="sahayi-title">{language}
    <p className="eyebrow">{messages.prototype}</p><div className="mark" aria-hidden="true">S</div>
    <h1 id="sahayi-title">{name}</h1><p className="tagline">{messages.tagline}</p>
    <p className={`availability ${availability}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{statusText}</p>
    <button type="button" disabled={availability !== 'available'} onClick={start} aria-describedby="start-note">{messages.start}</button><p id="start-note" className="start-note">{messages.startNote}</p>
  </section></main>
}

function Intake({ messages, language, procedures, error, query, match, piiWarning, onQueryChange, onFind, onExample, onBrowse, onConfirm, onChooseAnother, onStartOver }: {
  locale: Locale; messages: Messages; language: React.ReactNode; procedures: ProcedureSummary[] | null; error: boolean; query: string; match: MatchResult | null; piiWarning: boolean
  onQueryChange: (value: string) => void; onFind: () => void; onExample: (value: string) => void; onBrowse: () => void; onConfirm: (serviceId: string) => void; onChooseAnother: () => void; onStartOver: () => void
}) {
  const focusTarget = useRef<HTMLHeadingElement>(null)
  const resultTarget = useRef<HTMLDivElement>(null)
  useEffect(() => { focusTarget.current?.focus() }, [])
  useEffect(() => { if (match || piiWarning) resultTarget.current?.focus() }, [match, piiWarning])
  const examples = (procedures ?? []).flatMap(procedure => procedure.intent_phrases.slice(0, 1)).slice(0, 2)
  return <main className="kiosk-shell"><section className="content-card intake-page" aria-labelledby="intake-title">{language}
    <nav className="page-actions" aria-label={messages.intakeNavigation}><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    <p className="eyebrow">{messages.privateFinder}</p><h1 id="intake-title" ref={focusTarget} tabIndex={-1}>{messages.intakeTitle}</h1><p className="lead">{messages.intakeLead}</p>
    {error ? <div className="state-panel error" role="alert"><h2>{messages.loadServicesTitle}</h2><p>{messages.tryLater}</p><button type="button" className="secondary compact" onClick={onBrowse}>{messages.browseServices}</button></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">{messages.loadingServices}</div>
        : <><label className="intake-label" htmlFor="service-query">{messages.queryLabel}</label><p id="service-query-help" className="question-help">{messages.queryHelp}</p>
          <textarea id="service-query" value={query} maxLength={MAX_QUERY_LENGTH} rows={4} aria-describedby="service-query-help" onChange={event => onQueryChange(event.target.value)} />
          <p className="privacy-note">{messages.privacyNote}</p>
          {examples.length > 0 && <div className="example-chips" aria-label={messages.examples}>{examples.map(example => <button className="secondary chip" type="button" key={example} onClick={() => onExample(example)}>{example}</button>)}</div>}
          <div className="intake-actions"><button type="button" onClick={onFind} disabled={!query.trim()}>{messages.findService}</button><button type="button" className="secondary" onClick={onBrowse}>{messages.browseServices}</button></div></>}
    <div ref={resultTarget} tabIndex={-1}>
      {piiWarning && <p className="inline-error" role="alert">{messages.piiWarning}</p>}
      {match?.kind === 'confident' && <section className="match-result" aria-labelledby="suggested-title"><h2 id="suggested-title">{messages.suggestedTitle}</h2><h3>{match.candidate.procedure.title}</h3><p>{match.candidate.procedure.short_description}</p><div className="intake-actions"><button type="button" onClick={() => onConfirm(match.candidate.procedure.service_id)}>{messages.yesContinue}</button><button type="button" className="secondary" onClick={onChooseAnother}>{messages.chooseAnother}</button></div></section>}
      {match?.kind === 'ambiguous' && <section className="match-result" aria-labelledby="choose-title"><h2 id="choose-title">{messages.chooseServiceTitle}</h2><div className="candidate-list">{match.candidates.map(candidate => <button type="button" className="service-card" key={candidate.procedure.service_id} onClick={() => onConfirm(candidate.procedure.service_id)}><span><strong>{candidate.procedure.title}</strong><small>{candidate.procedure.short_description}</small></span><span aria-hidden="true">→</span></button>)}</div><button type="button" className="secondary compact" onClick={onChooseAnother}>{messages.chooseAnother}</button></section>}
      {match?.kind === 'none' && <section className="match-result" aria-labelledby="no-match-title"><h2 id="no-match-title">{messages.noMatchTitle}</h2><p>{messages.noMatchBody}</p><button type="button" className="secondary" onClick={onBrowse}>{messages.browseServices}</button></section>}
    </div>
  </section></main>
}

function ProcedureOverview({ procedure, locale, messages, onStartReadiness }: { procedure: ProcedureDetail; locale: Locale; messages: Messages; onStartReadiness: () => void }) {
  const sourceById = new Map(procedure.sources.map(source => [source.source_id, source]))
  return <article aria-labelledby="procedure-title">
    <p className="eyebrow">{procedure.category_label}</p><h1 id="procedure-title">{procedure.title}</h1><p className="lead">{procedure.short_description}</p>
    {procedure.trust_state === 'stale' && <div className="stale-warning" role="alert"><strong>{messages.staleTitle}</strong> {messages.staleBody}</div>}
    <section className={`trust-card ${procedure.trust_state}`} aria-labelledby="trust-title"><div><p className="overline">{messages.trustProvenance}</p><h2 id="trust-title">{messages.verifiedOfficial}</h2></div>
      <dl><div><dt>{messages.officialPublisher}</dt><dd>{procedure.official_publisher}</dd></div><div><dt>{messages.packVersion}</dt><dd>{procedure.pack_version}</dd></div><div><dt>{messages.verified}</dt><dd>{formatDate(procedure.last_verified_at, locale)}</dd></div><div><dt>{messages.freshness}</dt><dd>{procedure.trust_state === 'current' ? messages.current : messages.stale}</dd></div></dl>
      <div><h3>{messages.officialSources}</h3><ul className="source-list">{procedure.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></div>
    </section>
    <p className="disclaimer"><strong>{messages.guidanceOnly}</strong> {messages.governmentDisclaimer}</p>
    <section className="readiness-callout" aria-labelledby="readiness-callout-title"><div><h2 id="readiness-callout-title">{messages.checkNeed}</h2><p>{messages.checkNeedBody}</p></div><button type="button" onClick={onStartReadiness}>{messages.checkNeed}</button></section>
    <div className="detail-grid"><section><h2>{messages.beforeStart}</h2><ul>{procedure.requirements.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul><h3>{messages.documentGuidance}</h3>{procedure.required_documents.map(document => <div key={document.document_id}><strong>{document.name}</strong><p>{document.guidance}</p></div>)}</section>
      <section className={`fee-card ${procedure.fee.verification_status}`} role={procedure.fee.verification_status === 'conflicting' ? 'alert' : undefined} aria-labelledby="fee-title">
        <h2 id="fee-title">{procedure.fee.verification_status === 'conflicting' ? messages.feeNeedsConfirmation : messages.feeInformation}</h2><p>{procedure.fee.display_message}</p>
        {procedure.fee.claims.length > 0 && <ul className="fee-claims">{procedure.fee.claims.map(claim => <li key={`${claim.currency}-${claim.amount}-${claim.source_ids.join('-')}`}><strong>₹{Number(claim.amount).toLocaleString(dateLocales[locale])}</strong><span>{claim.qualifier}</span>
          <span className="claim-sources">{messages.source} {claim.source_ids.map((sourceId, index) => { const source = sourceById.get(sourceId); return source ? <span key={sourceId}>{index > 0 && ', '}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></span> : null })}</span></li>)}</ul>}
        {procedure.fee.resolution_guidance && <p className="resolution-guidance"><strong>{messages.beforePaying}</strong> {procedure.fee.resolution_guidance}</p>}
      </section></div>
    <section><h2>{messages.steps}</h2><ol className="steps">{procedure.steps.map(step => <li key={step.step_id}><div><span>{step.order}</span></div><section><h3>{step.title}</h3><p>{step.instruction}</p></section></li>)}</ol></section>
    <section><h2>{messages.whereApply}</h2>{procedure.submission_channels.map(channel => <div key={channel.channel_id}><h3>{channel.name}</h3><p>{channel.guidance}</p></div>)}</section>
    {procedure.tracking_guidance && <section><h2>{messages.tracking}</h2><p>{procedure.tracking_guidance.text}</p></section>}
    {procedure.additional_review_items.length > 0 && <section><h2>{messages.additionalReview}</h2><p>{messages.additionalReviewBody}</p><ul>{procedure.additional_review_items.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul></section>}
    <section><h2>{messages.limitations}</h2><ul>{procedure.limitations.map(item => <li key={item.fact_id}>{item.text}</li>)}</ul></section>
    <a className="official-handoff" href={procedure.official_handoff_url} target="_blank" rel="noopener noreferrer">{messages.openOfficialService} <span aria-hidden="true">↗</span></a>
  </article>
}

function ReadinessFlow({ response, loading, error, locale, messages, language, onBegin, onAnswer, onBack, onStartOver }: {
  response: ReadinessResponse | null; loading: boolean; error: boolean; locale: Locale; messages: Messages; language: React.ReactNode
  onBegin: () => void; onAnswer: (answer: ReadinessAnswer) => void; onBack: () => void; onStartOver: () => void
}) {
  const [selected, setSelected] = useState<ReadinessAnswer | undefined>()
  const [validationError, setValidationError] = useState(false)
  const focusTarget = useRef<HTMLHeadingElement>(null)
  const stateKey = response?.complete ? response.outcome?.outcome_id : response?.next_question?.question_id
  useEffect(() => { focusTarget.current?.focus() }, [stateKey, locale])
  const submit = (event: FormEvent) => { event.preventDefault(); if (selected === undefined || selected === '') { setValidationError(true); return }; setValidationError(false); onAnswer(selected) }
  const statusLabels = { ready: messages.statusReady, alternative_path: messages.statusAlternative, needs_information: messages.statusNeedsInformation, cannot_confirm: messages.statusCannotConfirm }

  return <main className="kiosk-shell"><section className="content-card readiness-page">{language}
    <nav className="page-actions" aria-label={messages.readinessNavigation}><button className="secondary compact" type="button" onClick={onBack} disabled={loading}>{messages.back}</button><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    {response === null ? <section aria-labelledby="readiness-title"><p className="eyebrow">{messages.readinessCheck}</p><h1 id="readiness-title" ref={focusTarget} tabIndex={-1}>{messages.checkNeed}</h1><p className="lead">{messages.readinessLead}</p>
      <ul className="privacy-points"><li>{messages.memoryOnly}</li><li>{messages.noStoreAnswers}</li><li>{messages.guidanceNotDecision}</li></ul>
      {error && <p className="inline-error" role="alert">{messages.readinessUnavailable}</p>}<button type="button" onClick={onBegin} disabled={loading}>{loading ? messages.starting : messages.beginReadiness}</button>
    </section> : response.complete && response.outcome ? <section className="readiness-result" aria-labelledby="result-title"><p className="eyebrow">{messages.readinessResult}</p><h1 id="result-title" ref={focusTarget} tabIndex={-1}>{response.outcome.title}</h1>
      <p className="result-status"><strong>{messages.status}</strong> {statusLabels[response.outcome.status]}</p>
      <section aria-labelledby="reason-title"><h2 id="reason-title">{messages.whyResult}</h2><p>{response.outcome.explanation}</p></section>
      <section aria-labelledby="next-steps-title"><h2 id="next-steps-title">{messages.recommendedSteps}</h2><ol>{response.recommended_next_steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      <section aria-labelledby="result-sources-title"><h2 id="result-sources-title">{messages.officialSources}</h2><ul className="source-list">{response.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></section>
      <p className="result-disclaimer"><strong>{messages.important}</strong> {response.disclaimer}</p>{response.official_handoff_url && <a className="official-handoff" href={response.official_handoff_url} target="_blank" rel="noopener noreferrer">{messages.openOfficialNext} <span aria-hidden="true">↗</span></a>}
    </section> : response.next_question ? <section aria-labelledby="question-title"><p className="progress" role="status" aria-live="polite">{formatMessage(messages.questionProgress, { current: response.progress.answered + 1, total: response.progress.total })}</p>
      <h1 id="question-title" ref={focusTarget} tabIndex={-1}>{response.next_question.prompt}</h1>{response.next_question.help_text && <p id="question-help" className="question-help">{response.next_question.help_text}</p>}
      {response.next_question.sensitivity === 'sensitive' && <p className="question-help"><strong>{messages.privacy}</strong> {messages.sensitiveHelp}</p>}
      <form onSubmit={submit}><fieldset aria-describedby={`${response.next_question.help_text ? 'question-help ' : ''}${validationError ? 'answer-error' : ''}`.trim()}><legend className="visually-hidden">{messages.chooseOne}</legend><div className="answer-options">
        {response.next_question.answer_type === 'boolean' && <><label><input type="radio" name="readiness-answer" value="yes" checked={selected === true} onChange={() => setSelected(true)} /> <span>{messages.yes}</span></label><label><input type="radio" name="readiness-answer" value="no" checked={selected === false} onChange={() => setSelected(false)} /> <span>{messages.no}</span></label></>}
        {response.next_question.answer_type === 'single_choice' && response.next_question.options?.map(option => <label key={option.option_id}><input type="radio" name="readiness-answer" value={option.option_id} checked={selected === option.option_id} onChange={() => setSelected(option.option_id)} /> <span>{option.label}</span></label>)}
        {response.next_question.answer_type === 'integer' && <label className="number-answer"><span>{messages.number}</span><input type="number" step="1" min={response.next_question.minimum ?? undefined} max={response.next_question.maximum ?? undefined} value={typeof selected === 'number' ? selected : ''} onChange={event => setSelected(event.target.value === '' ? undefined : Number(event.target.value))} /></label>}
      </div></fieldset>{validationError && <p id="answer-error" className="inline-error" role="alert">{messages.chooseAnswer}</p>}{error && <p className="inline-error" role="alert">{messages.continueError}</p>}<button type="submit" disabled={loading}>{loading ? messages.checking : messages.continue}</button></form>
    </section> : null}
  </section></main>
}

export default App
