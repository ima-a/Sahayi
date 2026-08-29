import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { assistantTurn, buildChecklist, evaluateReadiness, getDemoStatus, getHealth, getProcedure, getProcedures, getPublicConfig, prepareSyntheticForm, startDemoSubmission, type AssistantTurnResponse, type DemoJourneyResponse, type DemoScenarioId, type PersonalizedChecklist, type ProcedureDetail, type ProcedureSummary, type ReadinessAnswer, type ReadinessResponse, type SyntheticFormAssistance } from './api'
import { formatMessage, LANGUAGE_NAMES, LOCALES, UI_MESSAGES, type Locale, type Messages } from './i18n'
import { classifyServiceQuery, detectHighRiskPii, MAX_QUERY_LENGTH, type Candidate, type MatchResult } from './matcher'
import './App.css'

type Availability = 'loading' | 'available' | 'unavailable'
type Screen = 'welcome' | 'intake' | 'catalogue' | 'detail' | 'readiness' | 'assistant' | 'checklist' | 'form' | 'demo'
type ConversationMessage = { role: 'user' | 'assistant'; content: string }

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

function TrustExplanation({ messages }: { messages: Messages }) {
  return <details className="trust-explanation no-print"><summary>{messages.howSahayiWorks}</summary><p>{messages.trustExplanation}</p></details>
}

function App() {
  const [locale, setLocale] = useState<Locale>('en')
  const [availability, setAvailability] = useState<Availability>('loading')
  const [name, setName] = useState('Sahayi')
  const [agentAvailable, setAgentAvailable] = useState(false)
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
  const [agentConsent, setAgentConsent] = useState(false)
  const [agentInput, setAgentInput] = useState('')
  const [agentHistory, setAgentHistory] = useState<ConversationMessage[]>([])
  const [agentResponse, setAgentResponse] = useState<AssistantTurnResponse | null>(null)
  const [agentLoading, setAgentLoading] = useState(false)
  const [agentError, setAgentError] = useState(false)
  const [agentPiiWarning, setAgentPiiWarning] = useState(false)
  const [checklist, setChecklist] = useState<PersonalizedChecklist | null>(null)
  const [formAssistance, setFormAssistance] = useState<SyntheticFormAssistance | null>(null)
  const [assistanceLoading, setAssistanceLoading] = useState(false)
  const [assistanceError, setAssistanceError] = useState(false)
  const [demo, setDemo] = useState<DemoJourneyResponse | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState(false)
  const [sessionNotice, setSessionNotice] = useState<'ended' | 'inactive' | null>(null)
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const [activityReset, setActivityReset] = useState(0)
  const [inactivityTimeoutSeconds, setInactivityTimeoutSeconds] = useState(300)
  const [inactivityWarningSeconds, setInactivityWarningSeconds] = useState(30)
  const requestControllers = useRef(new Set<AbortController>())
  const sessionGeneration = useRef(0)
  const objectUrls = useRef(new Set<string>())
  const lastInteraction = useRef(0)
  const messages = UI_MESSAGES[locale]

  const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
  const request = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    const generation = sessionGeneration.current
    requestControllers.current.add(controller)
    try {
      const result = await operation(controller.signal)
      if (generation !== sessionGeneration.current) throw new DOMException('Session ended', 'AbortError')
      return result
    } finally {
      requestControllers.current.delete(controller)
    }
  }

  const clearCitizenState = (notice: 'ended' | 'inactive' | null) => {
    sessionGeneration.current += 1
    requestControllers.current.forEach(controller => controller.abort())
    requestControllers.current.clear()
    objectUrls.current.forEach(url => URL.revokeObjectURL(url))
    objectUrls.current.clear()
    setScreen('welcome'); setProcedures(null); setDetail(null); setCatalogueError(false); setDetailError(false)
    setReadiness(null); setReadinessAnswers({}); setReadinessHistory([]); setReadinessLoading(false); setReadinessError(false)
    setQuery(''); setMatch(null); setPiiWarning(false)
    setAgentConsent(false); setAgentInput(''); setAgentHistory([]); setAgentResponse(null); setAgentLoading(false); setAgentError(false); setAgentPiiWarning(false)
    setChecklist(null); setFormAssistance(null); setAssistanceLoading(false); setAssistanceError(false)
    setDemo(null); setDemoLoading(false); setDemoError(false); setInactivityWarning(false); setSessionNotice(notice)
    lastInteraction.current = Date.now()
  }

  const startOver = () => clearCitizenState(null)
  const endSession = () => clearCitizenState('ended')
  const continueSession = () => { lastInteraction.current = Date.now(); setInactivityWarning(false); setActivityReset(value => value + 1) }

  useEffect(() => { document.documentElement.lang = locale }, [locale])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    Promise.all([getHealth(controller.signal), getPublicConfig(controller.signal)])
      .then(([health, config]) => {
        if (active && health.status === 'ok') {
          setName(config.application_name); setAgentAvailable(config.agent_available)
          setInactivityTimeoutSeconds(config.inactivity_timeout_seconds); setInactivityWarningSeconds(config.inactivity_warning_seconds)
          setAvailability('available')
        }
      })
      .catch(() => active && setAvailability('unavailable'))
    return () => { active = false; controller.abort() }
  }, [])

  useEffect(() => {
    if (screen === 'welcome') return
    let warningTimer = 0
    let expiryTimer = 0
    const schedule = () => {
      window.clearTimeout(warningTimer); window.clearTimeout(expiryTimer)
      const elapsed = Date.now() - lastInteraction.current
      const expiryMs = inactivityTimeoutSeconds * 1000
      const warningAtMs = Math.max(0, expiryMs - inactivityWarningSeconds * 1000)
      if (elapsed >= expiryMs) { clearCitizenState('inactive'); return }
      setInactivityWarning(elapsed >= warningAtMs)
      warningTimer = window.setTimeout(() => setInactivityWarning(true), Math.max(0, warningAtMs - elapsed))
      expiryTimer = window.setTimeout(() => clearCitizenState('inactive'), expiryMs - elapsed)
    }
    const interact = () => { lastInteraction.current = Date.now(); setInactivityWarning(false); schedule() }
    const visibility = () => { if (document.visibilityState === 'visible') schedule() }
    lastInteraction.current = Date.now(); schedule()
    window.addEventListener('pointerdown', interact); window.addEventListener('keydown', interact); window.addEventListener('touchstart', interact)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearTimeout(warningTimer); window.clearTimeout(expiryTimer)
      window.removeEventListener('pointerdown', interact); window.removeEventListener('keydown', interact); window.removeEventListener('touchstart', interact)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [screen, inactivityTimeoutSeconds, inactivityWarningSeconds, activityReset])

  const loadProcedures = (nextLocale: Locale) => {
    setCatalogueError(false)
    request(signal => getProcedures(nextLocale, signal)).then(({ procedures: items }) => setProcedures(items)).catch(error => { if (!isAbort(error)) setCatalogueError(true) })
  }

  const changeLocale = (nextLocale: Locale) => {
    if (nextLocale === locale) return
    setLocale(nextLocale)
    setQuery('')
    setMatch(null)
    setPiiWarning(false)
    setAgentInput('')
    setAgentHistory([])
    setAgentResponse(null)
    setAgentError(false)
    setAgentPiiWarning(false)
    if (screen === 'checklist' && checklist) {
      setChecklist(null)
      setAssistanceLoading(true)
      request(signal => buildChecklist(checklist.service_id, readinessAnswers, nextLocale, signal)).then(setChecklist).catch(error => { if (!isAbort(error)) setAssistanceError(true) }).finally(() => setAssistanceLoading(false))
    } else setChecklist(null)
    if (screen === 'form' && formAssistance) {
      setFormAssistance(null)
      setAssistanceLoading(true)
      request(signal => prepareSyntheticForm(formAssistance.service_id, nextLocale, formAssistance.persona.persona_id, signal)).then(setFormAssistance).catch(error => { if (!isAbort(error)) setAssistanceError(true) }).finally(() => setAssistanceLoading(false))
    } else setFormAssistance(null)
    if (procedures !== null || screen === 'intake' || screen === 'catalogue') {
      setProcedures(null)
      loadProcedures(nextLocale)
    }
    if (detail) {
      request(signal => getProcedure(detail.service_id, nextLocale, signal)).then(setDetail).catch(error => { if (!isAbort(error)) setDetailError(true) })
      if (screen === 'readiness' && readiness !== null) {
        setReadinessLoading(true)
        request(signal => evaluateReadiness(detail.service_id, readinessAnswers, nextLocale, signal))
          .then(setReadiness)
          .catch(() => setReadinessError(true))
          .finally(() => setReadinessLoading(false))
      }
    }
    if (screen === 'demo' && demo) {
      setDemoLoading(true)
      request(signal => getDemoStatus(demo, demo.current_status_id, nextLocale, signal)).then(setDemo).catch(error => { if (!isAbort(error)) setDemoError(true) }).finally(() => setDemoLoading(false))
    }
  }

  const start = () => {
    setSessionNotice(null)
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
    request(signal => getProcedure(serviceId, locale, signal)).then(setDetail).catch(error => { if (!isAbort(error)) setDetailError(true) })
  }

  const findService = () => {
    const result = classifyServiceQuery(query, procedures ?? [])
    if (result.kind === 'pii') { setPiiWarning(true); setMatch(null); return }
    setPiiWarning(false); setMatch(result.result)
  }

  const openAssistant = () => {
    setScreen('assistant')
    setAgentError(false)
    setAgentPiiWarning(false)
  }

  const submitAgent = async () => {
    if (!agentConsent || !agentInput.trim() || agentLoading) return
    if (detectHighRiskPii(agentInput)) { setAgentPiiWarning(true); setAgentResponse(null); return }
    setAgentPiiWarning(false)
    setAgentError(false)
    setAgentLoading(true)
    const current = agentInput.trim()
    try {
      const response = await request(signal => assistantTurn({
        locale,
        message: current,
        history: agentHistory.slice(-4),
        service_id: detail?.service_id ?? null,
        readiness_answers: detail ? readinessAnswers : {},
        demo_status_id: demo?.current_status_id ?? null,
        consent: true,
      }, signal))
      setAgentResponse(response)
      if (response.status !== 'blocked') {
        const nextHistory: ConversationMessage[] = [...agentHistory, { role: 'user', content: current }, { role: 'assistant', content: response.message }]
        setAgentHistory(nextHistory.slice(-6))
        setAgentInput('')
      }
    } catch (error) { if (!isAbort(error)) setAgentError(true) }
    finally { setAgentLoading(false) }
  }

  const chooseAgentService = async (serviceId: string) => {
    setAgentError(false)
    try {
      const selected = await request(signal => getProcedure(serviceId, locale, signal))
      setDetail(selected)
      setReadiness(null)
      setReadinessAnswers({})
      setReadinessHistory([])
      setAgentResponse(previous => previous ? { ...previous, selection: { state: 'selected', service_id: serviceId, choices: [] } } : previous)
    } catch (error) { if (!isAbort(error)) setAgentError(true) }
  }

  const openChecklist = async (serviceId = detail?.service_id) => {
    if (!serviceId) return
    setScreen('checklist')
    setChecklist(null)
    setAssistanceError(false)
    setAssistanceLoading(true)
    try { setChecklist(await request(signal => buildChecklist(serviceId, detail?.service_id === serviceId ? readinessAnswers : {}, locale, signal))) }
    catch (error) { if (!isAbort(error)) setAssistanceError(true) }
    finally { setAssistanceLoading(false) }
  }

  const openFormAssistance = async (serviceId = detail?.service_id, personaId: string | null = null) => {
    if (!serviceId) return
    setScreen('form')
    setFormAssistance(null)
    setAssistanceError(false)
    setAssistanceLoading(true)
    try { setFormAssistance(await request(signal => prepareSyntheticForm(serviceId, locale, personaId, signal))) }
    catch (error) { if (!isAbort(error)) setAssistanceError(true) }
    finally { setAssistanceLoading(false) }
  }

  const handleAgentAction = async (actionId: string, serviceId: string | null) => {
    if (!serviceId) return
    if (actionId === 'view-procedure') { selectProcedure(serviceId); return }
    if (actionId === 'build-checklist') { await openChecklist(serviceId); return }
    if (actionId === 'prepare-synthetic-form') { await openFormAssistance(serviceId); return }
    if (actionId === 'start-readiness') {
      try {
        const selected = await request(signal => getProcedure(serviceId, locale, signal))
        setDetail(selected)
        setReadiness(null)
        setReadinessAnswers({})
        setReadinessHistory([])
        setReadinessError(false)
        setScreen('readiness')
      } catch (error) { if (!isAbort(error)) setAgentError(true) }
      return
    }
    if (actionId === 'open-official-service') {
      try {
        const selected = await request(signal => getProcedure(serviceId, locale, signal))
        window.open(selected.official_handoff_url, '_blank', 'noopener,noreferrer')
      } catch (error) { if (!isAbort(error)) setAgentError(true) }
    }
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
    try { return await request(signal => evaluateReadiness(detail.service_id, answers, locale, signal)) }
    catch (error) { if (!isAbort(error)) setReadinessError(true); return null }
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

  const openDemo = async (serviceId = formAssistance?.service_id ?? checklist?.service_id ?? detail?.service_id) => {
    if (!serviceId) return
    setScreen('demo'); setDemo(null); setDemoError(false)
    if (!formAssistance || formAssistance.service_id !== serviceId) {
      setDemoLoading(true)
      try { setFormAssistance(await request(signal => prepareSyntheticForm(serviceId, locale, null, signal))) }
      catch (error) { if (!isAbort(error)) setDemoError(true) }
      finally { setDemoLoading(false) }
    }
  }
  const beginDemo = async (scenarioId: DemoScenarioId) => {
    const serviceId = demo?.service_id ?? formAssistance?.service_id
    const personaId = demo?.persona_id ?? formAssistance?.persona.persona_id
    if (!serviceId || !personaId) return
    setDemoLoading(true); setDemoError(false)
    try { setDemo(await request(signal => startDemoSubmission(serviceId, personaId, scenarioId, locale, signal))) }
    catch (error) { if (!isAbort(error)) setDemoError(true) }
    finally { setDemoLoading(false) }
  }
  const advanceDemo = async () => {
    if (!demo || !demo.can_advance) return
    const index = demo.statuses.findIndex(item => item.status_id === demo.current_status_id)
    const next = demo.statuses[index + 1]?.status_id
    if (!next) return
    setDemoLoading(true); setDemoError(false)
    try { setDemo(await request(signal => getDemoStatus(demo, next, locale, signal))) }
    catch (error) { if (!isAbort(error)) setDemoError(true) }
    finally { setDemoLoading(false) }
  }

  const language = <LanguageControls locale={locale} onChange={changeLocale} messages={messages} />
  const statusText = availability === 'loading' ? messages.availabilityLoading : availability === 'available' ? messages.availabilityReady : messages.availabilityUnavailable
  const wrapSession = (content: ReactNode) => <>{content}{screen !== 'welcome' && <>
    <button className="end-session no-print" type="button" onClick={endSession}>{messages.endSession}</button>
    <TrustExplanation messages={messages} />
    {inactivityWarning && <div className="session-warning" role="alertdialog" aria-modal="true" aria-labelledby="session-warning-title">
      <div><h2 id="session-warning-title">{messages.inactivityTitle}</h2><p>{messages.inactivityBody}</p><button type="button" autoFocus onClick={continueSession}>{messages.continueSession}</button><button className="secondary" type="button" onClick={endSession}>{messages.endSession}</button></div>
    </div>}
  </>}</>

  if (screen === 'assistant') return wrapSession(<AssistantGuide messages={messages} language={language} available={agentAvailable} consent={agentConsent} input={agentInput}
    history={agentHistory} response={agentResponse} loading={agentLoading} error={agentError} piiWarning={agentPiiWarning}
    onConsent={setAgentConsent} onInput={value => { setAgentInput(value); setAgentPiiWarning(false) }} onSubmit={submitAgent}
    onChooseService={chooseAgentService} onAction={handleAgentAction} onBack={() => setScreen(demo ? 'demo' : detail ? 'detail' : 'welcome')} onStartOver={startOver} />)

  if (screen === 'checklist') return wrapSession(<ChecklistView messages={messages} language={language} checklist={checklist} loading={assistanceLoading} error={assistanceError}
    onBack={() => setScreen(detail ? 'detail' : 'assistant')} onStartOver={startOver} onForm={() => openFormAssistance(checklist?.service_id)} onDemo={() => openDemo(checklist?.service_id)} />)

  if (screen === 'form') return wrapSession(<FormAssistanceView messages={messages} language={language} assistance={formAssistance} loading={assistanceLoading} error={assistanceError}
    onBack={() => setScreen(detail ? 'detail' : 'assistant')} onStartOver={startOver} onSelectPersona={personaId => openFormAssistance(formAssistance?.service_id, personaId)} onDemo={() => openDemo(formAssistance?.service_id)} />)

  if (screen === 'demo') return wrapSession(<DemoJourney messages={messages} language={language} journey={demo} loading={demoLoading} error={demoError}
    onBack={() => setScreen(formAssistance ? 'form' : detail ? 'detail' : 'welcome')} onStartOver={startOver} onBegin={beginDemo} onAdvance={advanceDemo}
    onSwitch={beginDemo} onAskAi={openAssistant} />)

  if (screen === 'intake') return wrapSession(<Intake locale={locale} messages={messages} language={language} procedures={procedures} error={catalogueError} query={query} match={match} piiWarning={piiWarning}
    onQueryChange={value => { setQuery(value); setMatch(null); setPiiWarning(false) }} onFind={findService}
    onExample={value => { setQuery(value); setMatch(null); setPiiWarning(false) }} onBrowse={() => setScreen('catalogue')}
    onCandidate={candidate => setMatch({ kind: 'confident', candidate, source: 'deterministic' })}
    onConfirm={serviceId => { setQuery(''); setMatch(null); setPiiWarning(false); selectProcedure(serviceId) }}
    onChooseAnother={() => { setMatch(null); setQuery('') }} onStartOver={startOver} />)

  if (screen === 'catalogue') return wrapSession(<main className="kiosk-shell"><section className="content-card" aria-labelledby="catalogue-title">{language}
    <header className="page-header"><div><p className="eyebrow">{messages.verifiedGuidance}</p><h1 id="catalogue-title">{messages.supportedServices}</h1><p>{messages.chooseService}</p></div><button className="secondary compact" type="button" onClick={startOver}>{messages.startOver}</button></header>
    {catalogueError ? <div className="state-panel error" role="alert"><h2>{messages.loadServicesTitle}</h2><p>{messages.loadServicesBody}</p></div>
      : procedures === null ? <div className="state-panel" role="status" aria-live="polite">{messages.loadingServices}</div>
        : procedures.length === 0 ? <div className="state-panel" role="status"><h2>{messages.noProceduresTitle}</h2><p>{messages.noProceduresBody}</p></div>
          : <ul className="service-list">{procedures.map(procedure => <li key={procedure.service_id}><button className="service-card" type="button" onClick={() => selectProcedure(procedure.service_id)}>
            <span><strong>{procedure.title}</strong><small>{procedure.short_description}</small>{procedure.attention_required && <small className="attention-badge">{messages.feeNeedsConfirmation}</small>}</span><span aria-hidden="true">→</span>
          </button></li>)}</ul>}
  </section></main>)

  if (screen === 'detail') return wrapSession(<main className="kiosk-shell"><section className="content-card detail-page" aria-live="polite">{language}
    <nav className="page-actions" aria-label={messages.procedureNavigation}><button className="secondary compact" type="button" onClick={() => setScreen('catalogue')}>{messages.back}</button><button className="secondary compact" type="button" onClick={startOver}>{messages.startOver}</button></nav>
    {detailError ? <div className="state-panel error" role="alert"><h1>{messages.procedureUnavailable}</h1><p>{messages.procedureUnavailableBody}</p></div>
      : detail === null ? <div className="state-panel" role="status">{messages.loadingProcedure}</div>
        : <ProcedureOverview procedure={detail} locale={locale} messages={messages} onStartReadiness={openReadiness} onAskAi={openAssistant} onChecklist={() => openChecklist()} onForm={() => openFormAssistance()} />}
  </section></main>)

  if (screen === 'readiness' && detail) return wrapSession(<ReadinessFlow key={readiness?.complete ? readiness.outcome?.outcome_id : readiness?.next_question?.question_id ?? `introduction-${locale}`}
    response={readiness} loading={readinessLoading} error={readinessError} locale={locale} messages={messages} language={language}
    onBegin={beginReadiness} onAnswer={answerReadiness} onBack={backReadiness} onStartOver={startOver} onChecklist={() => openChecklist()} onForm={() => openFormAssistance()} />)

  return <main className="kiosk-shell"><section className="welcome-card" aria-labelledby="sahayi-title">{language}
    {sessionNotice && <p className="session-cleared" role="status" aria-live="polite">{sessionNotice === 'ended' ? messages.sessionCleared : messages.inactivityCleared}</p>}
    <p className="eyebrow">{messages.prototype}</p><div className="mark" aria-hidden="true">S</div>
    <h1 id="sahayi-title">{name}</h1><p className="tagline">{messages.tagline}</p>
    <p className={`availability ${availability}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{statusText}</p>
    <div className="welcome-actions"><button type="button" disabled={availability !== 'available'} onClick={start} aria-describedby="start-note">{messages.start}</button><button className="secondary" type="button" disabled={availability !== 'available'} onClick={openAssistant}>{messages.askAi}</button></div><p id="start-note" className="start-note">{messages.startNote}</p>
  </section></main>
}

function Intake({ messages, language, procedures, error, query, match, piiWarning, onQueryChange, onFind, onExample, onBrowse, onCandidate, onConfirm, onChooseAnother, onStartOver }: {
  locale: Locale; messages: Messages; language: React.ReactNode; procedures: ProcedureSummary[] | null; error: boolean; query: string; match: MatchResult | null; piiWarning: boolean
  onQueryChange: (value: string) => void; onFind: () => void; onExample: (value: string) => void; onBrowse: () => void; onCandidate: (candidate: Candidate) => void; onConfirm: (serviceId: string) => void; onChooseAnother: () => void; onStartOver: () => void
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
    <div ref={resultTarget} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true">
      {piiWarning && <p className="inline-error" role="alert">{messages.piiWarning}</p>}
      {match && <p className="local-match-status">{match.kind !== 'none' && <><strong>{messages.matchedOnDevice}</strong> </>}{messages.notSentOnline}{match.kind !== 'none' && <> {messages.confirmMatch}</>}</p>}
      {match?.kind === 'confident' && <section className="match-result" aria-labelledby="suggested-title"><h2 id="suggested-title">{messages.suggestedTitle}</h2><h3>{match.candidate.procedure.title}</h3><p>{match.candidate.procedure.short_description}</p><div className="intake-actions"><button type="button" onClick={() => onConfirm(match.candidate.procedure.service_id)}>{messages.yesContinue}</button><button type="button" className="secondary" onClick={onChooseAnother}>{messages.chooseAnother}</button></div></section>}
      {match?.kind === 'ambiguous' && <section className="match-result" aria-labelledby="choose-title"><h2 id="choose-title">{messages.chooseServiceTitle}</h2><div className="candidate-list">{match.candidates.map(candidate => <button type="button" className="service-card" key={candidate.procedure.service_id} onClick={() => onCandidate(candidate)}><span><strong>{candidate.procedure.title}</strong><small>{candidate.procedure.short_description}</small></span><span aria-hidden="true">→</span></button>)}</div><button type="button" className="secondary compact" onClick={onChooseAnother}>{messages.chooseAnother}</button></section>}
      {match?.kind === 'none' && <section className="match-result" aria-labelledby="no-match-title"><h2 id="no-match-title">{messages.noMatchTitle}</h2><p>{messages.noMatchBody}</p><button type="button" className="secondary" onClick={onBrowse}>{messages.browseServices}</button></section>}
    </div>
  </section></main>
}

function ProcedureOverview({ procedure, locale, messages, onStartReadiness, onAskAi, onChecklist, onForm }: { procedure: ProcedureDetail; locale: Locale; messages: Messages; onStartReadiness: () => void; onAskAi: () => void; onChecklist: () => void; onForm: () => void }) {
  const sourceById = new Map(procedure.sources.map(source => [source.source_id, source]))
  return <article aria-labelledby="procedure-title">
    <p className="eyebrow">{procedure.category_label}</p><h1 id="procedure-title">{procedure.title}</h1><p className="lead">{procedure.short_description}</p>
    {procedure.trust_state === 'stale' && <div className="stale-warning" role="alert"><strong>{messages.staleTitle}</strong> {messages.staleBody}</div>}
    <section className={`trust-card ${procedure.trust_state}`} aria-labelledby="trust-title"><div><p className="overline">{messages.trustProvenance}</p><h2 id="trust-title">{messages.verifiedOfficial}</h2></div>
      <dl><div><dt>{messages.officialPublisher}</dt><dd>{procedure.official_publisher}</dd></div><div><dt>{messages.packVersion}</dt><dd>{procedure.pack_version}</dd></div><div><dt>{messages.verified}</dt><dd>{formatDate(procedure.last_verified_at, locale)}</dd></div><div><dt>{messages.nextReview}</dt><dd>{formatDate(procedure.review_due_at, locale)}</dd></div><div><dt>{messages.freshness}</dt><dd>{procedure.trust_state === 'current' ? messages.current : messages.stale}</dd></div><div><dt>{messages.monitoringPrototype}</dt><dd>{procedure.monitoring.prototype_available ? messages.oneShotReview : messages.notAvailable}</dd></div><div><dt>{messages.humanReview}</dt><dd>{messages.required}</dd></div></dl>
      <div><h3>{messages.officialSources}</h3><ul className="source-list">{procedure.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></div>
    </section>
    <p className="disclaimer"><strong>{messages.guidanceOnly}</strong> {messages.governmentDisclaimer}</p>
    <div className="assistance-actions"><button type="button" className="secondary" onClick={onAskAi}>{messages.askAi}</button><button type="button" className="secondary" onClick={onChecklist}>{messages.createChecklist}</button><button type="button" className="secondary" onClick={onForm}>{messages.syntheticForm}</button></div>
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

function ReadinessFlow({ response, loading, error, locale, messages, language, onBegin, onAnswer, onBack, onStartOver, onChecklist, onForm }: {
  response: ReadinessResponse | null; loading: boolean; error: boolean; locale: Locale; messages: Messages; language: React.ReactNode
  onBegin: () => void; onAnswer: (answer: ReadinessAnswer) => void; onBack: () => void; onStartOver: () => void; onChecklist: () => void; onForm: () => void
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
      <p className="result-disclaimer"><strong>{messages.important}</strong> {response.disclaimer}</p><div className="assistance-actions"><button type="button" onClick={onChecklist}>{messages.createChecklist}</button><button className="secondary" type="button" onClick={onForm}>{messages.syntheticForm}</button></div>{response.official_handoff_url && <a className="official-handoff" href={response.official_handoff_url} target="_blank" rel="noopener noreferrer">{messages.openOfficialNext} <span aria-hidden="true">↗</span></a>}
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

function AssistantGuide({ messages, language, available, consent, input, history, response, loading, error, piiWarning, onConsent, onInput, onSubmit, onChooseService, onAction, onBack, onStartOver }: {
  messages: Messages; language: React.ReactNode; available: boolean; consent: boolean; input: string; history: ConversationMessage[]; response: AssistantTurnResponse | null; loading: boolean; error: boolean; piiWarning: boolean
  onConsent: (value: boolean) => void; onInput: (value: string) => void; onSubmit: () => void; onChooseService: (serviceId: string) => void; onAction: (actionId: string, serviceId: string | null) => void; onBack: () => void; onStartOver: () => void
}) {
  const responseTarget = useRef<HTMLDivElement>(null)
  useEffect(() => { if (response || error || piiWarning) responseTarget.current?.focus() }, [response, error, piiWarning])
  return <main className="kiosk-shell"><section className="content-card agent-page" aria-labelledby="agent-title">{language}
    <nav className="page-actions" aria-label={messages.agentNavigation}><button className="secondary compact" type="button" onClick={onBack}>{messages.back}</button><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    <p className="eyebrow">{messages.aiDisclosure}</p><h1 id="agent-title">{messages.aiTitle}</h1>
    <section className="disclosure-card" aria-labelledby="disclosure-title"><h2 id="disclosure-title">{messages.privacyNotice}</h2><p>{messages.aiDataUse}</p><p>{messages.aiNoZdr}</p><p><strong>{messages.aiDisclaimer}</strong></p>
      <label className="consent-choice"><input type="checkbox" checked={consent} disabled={!available} onChange={event => onConsent(event.target.checked)} /> <span>{messages.aiConsent}</span></label>
    </section>
    {!available && <p className="inline-error" role="status">{messages.aiUnavailable}</p>}
    {available && consent && <form className="agent-form" onSubmit={event => { event.preventDefault(); onSubmit() }}>
      <label htmlFor="agent-message">{messages.aiMessageLabel}</label><p id="agent-message-help">{messages.aiMessageHelp}</p>
      <textarea id="agent-message" maxLength={500} rows={4} value={input} aria-describedby="agent-message-help" onChange={event => onInput(event.target.value)} />
      <button type="submit" disabled={loading || !input.trim()}>{loading ? messages.sending : messages.send}</button>
    </form>}
    {history.length > 0 && <section className="conversation" aria-labelledby="conversation-title"><h2 id="conversation-title">{messages.aiConversation}</h2>{history.map((message, index) => <p className={`message ${message.role}`} key={`${message.role}-${index}`}>{message.content}</p>)}</section>}
    <div ref={responseTarget} tabIndex={-1} aria-live="polite">
      {(error || piiWarning) && <p className="inline-error" role="alert">{piiWarning ? messages.piiWarning : messages.aiError}</p>}
      {response && <section className="agent-response"><p>{response.message}</p>
        {response.selection.choices.length > 0 && <div className="candidate-list">{response.selection.choices.map(choice => <button className="service-card" type="button" key={choice.service_id} onClick={() => onChooseService(choice.service_id)}><strong>{choice.title}</strong><span aria-hidden="true">→</span></button>)}</div>}
        {response.fact_cards.map(card => <article className="fact-card" key={card.card_id}><h2>{card.title}</h2><p>{card.text}</p></article>)}
        {response.sources.length > 0 && <><h2>{messages.officialSources}</h2><ul className="source-list">{response.sources.map(source => <li key={source.source_id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title} <span aria-hidden="true">↗</span></a></li>)}</ul></>}
        {response.actions.length > 0 && <div className="assistance-actions">{response.actions.map(action => <button type="button" key={action.action_id} onClick={() => onAction(action.action_id, action.service_id)}>{action.label}</button>)}</div>}
        {response.tool_trace.length > 0 && <p className="activity"><strong>{messages.aiActivity}:</strong> {messages.checkingVerified}</p>}
        <p className="result-disclaimer">{response.disclaimer}</p>
      </section>}
    </div>
  </section></main>
}

function ChecklistView({ messages, language, checklist, loading, error, onBack, onStartOver, onForm, onDemo }: {
  messages: Messages; language: React.ReactNode; checklist: PersonalizedChecklist | null; loading: boolean; error: boolean; onBack: () => void; onStartOver: () => void; onForm: () => void; onDemo: () => void
}) {
  const sources = new Map((checklist?.sources ?? []).map(source => [source.source_id, source]))
  const citedItems = (items: Array<{ item_id: string; text: string; source_ids: string[] }>) => <ul className="checklist-items">{items.map(item => <li key={item.item_id}><p>{item.text}</p><SourceReferences ids={item.source_ids} sources={sources} messages={messages} /></li>)}</ul>
  return <main className="kiosk-shell"><section className="content-card printable" aria-labelledby="checklist-title">{language}
    <nav className="page-actions no-print" aria-label={messages.assistanceNavigation}><button className="secondary compact" type="button" onClick={onBack}>{messages.back}</button><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    {loading ? <div className="state-panel" role="status">{messages.checking}</div> : error || !checklist ? <p className="inline-error" role="alert">{messages.continueError}</p> : <>
      <p className="eyebrow">{messages.verifiedGuidance}</p><h1 id="checklist-title">{messages.checklistTitle}</h1><p className="lead">{checklist.title}</p>
      <section className="checklist-result"><h2>{messages.readinessResult}</h2><p>{checklist.result.text}</p><SourceReferences ids={checklist.result.source_ids} sources={sources} messages={messages} /></section>
      <section><h2>{messages.readySection}</h2>{citedItems(checklist.ready)}</section>
      <section><h2>{messages.documentsSection}</h2><ul className="checklist-items">{checklist.documents.map(document => <li key={document.document_id}><strong>{document.name}</strong><p>{document.guidance}</p><SourceReferences ids={document.source_ids} sources={sources} messages={messages} /></li>)}</ul></section>
      <section><h2>{messages.confirmSection}</h2>{citedItems(checklist.confirm)}</section><section><h2>{messages.steps}</h2>{citedItems(checklist.steps)}</section>
      <section><h2>{messages.warningsSection}</h2>{citedItems(checklist.warnings)}</section><section><h2>{messages.whereSection}</h2>{citedItems(checklist.where)}</section>
      <section><h2>{messages.notVerifiedSection}</h2>{citedItems(checklist.not_verified)}</section><p className="result-disclaimer">{checklist.disclaimer}</p>
      <div className="assistance-actions no-print"><button type="button" onClick={() => window.print()}>{messages.print}</button><button type="button" className="secondary" onClick={onForm}>{messages.syntheticForm}</button><button type="button" className="secondary" onClick={onDemo}>{messages.continueDemo}</button></div>
    </>}
  </section></main>
}

function FormAssistanceView({ messages, language, assistance, loading, error, onBack, onStartOver, onSelectPersona, onDemo }: {
  messages: Messages; language: React.ReactNode; assistance: SyntheticFormAssistance | null; loading: boolean; error: boolean; onBack: () => void; onStartOver: () => void; onSelectPersona: (personaId: string) => void; onDemo: () => void
}) {
  const sources = new Map((assistance?.sources ?? []).map(source => [source.source_id, source]))
  return <main className="kiosk-shell"><section className="content-card printable" aria-labelledby="form-title">{language}
    <nav className="page-actions no-print" aria-label={messages.assistanceNavigation}><button className="secondary compact" type="button" onClick={onBack}>{messages.back}</button><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    {loading ? <div className="state-panel" role="status">{messages.checking}</div> : error || !assistance ? <p className="inline-error" role="alert">{messages.continueError}</p> : <>
      <p className="watermark" role="note">{assistance.watermark}</p><p className="eyebrow">{messages.worksheetTitle}</p><h1 id="form-title">{assistance.title}</h1><label className="persona-choice" htmlFor="persona-select">{messages.sampleCitizen}</label><select id="persona-select" value={assistance.persona.persona_id} onChange={event => onSelectPersona(event.target.value)}>{assistance.available_personas.map(persona => <option value={persona.persona_id} key={persona.persona_id}>{persona.display_name}</option>)}</select>
      <p className="privacy-callout"><strong>{messages.privacyNotice}:</strong> {assistance.privacy_notice}</p>
      <dl className="worksheet-fields">{assistance.fields.map(field => <div key={field.field_id}><dt>{field.label}</dt><dd><p>{field.explanation}</p><p><strong>{field.value === null ? messages.privateValue : messages.demoValue}:</strong> {field.value ?? '—'}</p><p><strong>{messages.sourceStatus}:</strong> {field.status === 'verified_official_form' ? messages.verifiedOfficialForm : messages.preparationOnly}</p><SourceReferences ids={field.source_ids} sources={sources} messages={messages} /></dd></div>)}</dl>
      <p className="result-disclaimer">{assistance.disclaimer}</p><div className="assistance-actions no-print"><button type="button" onClick={() => window.print()}>{messages.print}</button><button type="button" onClick={onDemo}>{messages.continueDemo}</button></div>
    </>}
  </section></main>
}

function DemoJourney({ messages, language, journey, loading, error, onBack, onStartOver, onBegin, onAdvance, onSwitch, onAskAi }: {
  messages: Messages; language: ReactNode; journey: DemoJourneyResponse | null; loading: boolean; error: boolean
  onBack: () => void; onStartOver: () => void; onBegin: (scenario: DemoScenarioId) => void; onAdvance: () => void; onSwitch: (scenario: DemoScenarioId) => void; onAskAi: () => void
}) {
  const currentRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (journey) currentRef.current?.focus() }, [journey])
  return <main className="kiosk-shell"><section className="content-card demo-page" aria-labelledby="demo-title">{language}
    <nav className="page-actions" aria-label={messages.demoNavigation}><button className="secondary compact" type="button" onClick={onBack}>{messages.back}</button><button className="secondary compact" type="button" onClick={onStartOver}>{messages.startOver}</button></nav>
    <p className="eyebrow">{messages.syntheticSimulation}</p><h1 id="demo-title">{messages.demoSubmission}</h1>
    {!journey ? <section className="disclosure-card" aria-labelledby="demo-disclosure-title"><h2 id="demo-disclosure-title">{messages.beforeDemo}</h2>
      <ul><li>{messages.noApplicationSubmitted}</li><li>{messages.noGovernmentContact}</li><li>{messages.onlySyntheticData}</li><li>{messages.demoClears}</li></ul>
      {error && <p className="inline-error" role="alert">{messages.demoError}</p>}
      <div className="assistance-actions"><button type="button" disabled={loading} onClick={() => onBegin('normal-completion')}>{messages.normalScenario}</button><button className="secondary" type="button" disabled={loading} onClick={() => onBegin('action-required')}>{messages.actionScenario}</button></div>
    </section> : <>
      <p className="demo-reference"><strong>{messages.syntheticReference}:</strong> <code>{journey.demo_reference}</code></p>
      <p className="result-disclaimer">{journey.disclosure}</p>
      <div className="scenario-controls"><span>{messages.switchScenario}</span><button type="button" className="secondary compact" disabled={loading || journey.scenario_id === 'normal-completion'} onClick={() => onSwitch('normal-completion')}>{messages.normalScenario}</button><button type="button" className="secondary compact" disabled={loading || journey.scenario_id === 'action-required'} onClick={() => onSwitch('action-required')}>{messages.actionScenario}</button></div>
      <ol className="demo-timeline" aria-label={messages.simulatedStatus} aria-live="polite">{journey.statuses.map(item => <li key={item.status_id} className={item.state} aria-current={item.state === 'current' ? 'step' : undefined}>
        <span className="status-marker" aria-hidden="true" /><div><p className="status-state">{item.state === 'complete' ? messages.complete : item.state === 'current' ? messages.currentStatus : messages.upcoming}</p><h2 ref={item.state === 'current' ? currentRef : undefined} tabIndex={item.state === 'current' ? -1 : undefined}>{item.title}</h2><p>{item.explanation}</p><p><strong>{item.simulated_time_label}</strong></p><p>{item.next_action}</p>{item.source_ids.length > 0 && <small className="source-references"><strong>{messages.relatedReferences}:</strong> {item.source_ids.join(', ')}</small>}</div>
      </li>)}</ol>
      {error && <p className="inline-error" role="alert">{messages.demoError}</p>}
      <div className="assistance-actions"><button type="button" disabled={loading || !journey.can_advance} onClick={onAdvance}>{loading ? messages.checking : journey.can_advance ? messages.advanceDemo : messages.demoComplete}</button><button className="secondary" type="button" onClick={onAskAi}>{messages.askAiStatus}</button></div>
      <p className="result-disclaimer">{journey.disclaimer}</p>
    </>}
  </section></main>
}

function SourceReferences({ ids, sources, messages }: { ids: string[]; sources: Map<string, { source_id: string; title: string; url: string }>; messages: Messages }) {
  return <small className="source-references">{messages.source} {ids.map((id, index) => { const source = sources.get(id); return source ? <span key={id}>{index > 0 && ', '}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></span> : null })}</small>
}

export default App
